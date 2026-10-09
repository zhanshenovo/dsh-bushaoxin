window.__ModuleLoader__.load({ id: "dsh-bushaoxin", factory: (require) => {
	var module = { exports: {} };
	var exports = module.exports;
	let react = require("react");

	/**
	 * dsh-bushaoxin client：输入框上方那条「不烧心」控件。
	 *
	 * 两件事：
	 *   1. 常驻一行门诊心率（原来的挂件，只读心跳）。
	 *   2. 点一下「不烧心」按钮，在**上方**拉出一个滑条，直接选文风强度。
	 *
	 * 滑条为什么敢说自己生效：它同时做两件事 ——
	 *   a. 写 localStorage，刷新页面还记得（UI 的反应速度）；
	 *   b. POST /dsh-bushaoxin/style，把本会话的强度真的写进宿主状态（真正生效的那份）。
	 * 写失败就退回只存本地，并且**如实告诉用户没生效**，不做"看起来能用"的假控件。
	 */

	const NS = "dsh-bushaoxin";
	const name = "dsh-bushaoxin";
	const inject = ["slots", "locale", "theme"];

	const POLL_MS = 15000;
	const ROUTE = "/dsh-bushaoxin/heartbeat";
	const STYLE_ROUTE = "/dsh-bushaoxin/style";
	const STORE_KEY = "dsh-bushaoxin.style.slider";
	const GLYPH = "\u{1F525}"; // 🔥
	const PILL = "\u{1F48A}"; // 💊
	const SLIDER = "\u{1F336}"; // 🌶

	// 和宿主 LEVEL_BY_SLIDER 一致；顺序就是滑条顺序，不要各自为政。
	const STOPS = ["关", "轻", "中", "重"];
	const STOP_NOTE = {
		关: "完全不用梗，正常说话",
		轻: "一段里最多一次，克制",
		中: "技术话题平均每两三轮一次",
		重: "基本每轮都带，最多两次"
	};

	const TONE_COLOR = {
		calm: "#1a7f37",
		note: "#9a6700",
		warn: "#bc4c00",
		risk: "#cf222e"
	};

	const S = {
		root: {
			display: "flex", flexDirection: "column", gap: "6px", width: "100%",
			fontSize: "11px", lineHeight: "1.5", color: "var(--dsw-alias-label-secondary, #57606a)",
			padding: "4px 2px 0", userSelect: "none"
		},
		line: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" },
		badge: {
			borderRadius: "999px", padding: "1px 7px", fontWeight: 600,
			border: "1px solid transparent", whiteSpace: "nowrap"
		},
		// 「不烧心」按钮：点它开合滑条面板。
		trigger: {
			borderRadius: "999px", padding: "2px 10px", fontWeight: 600, cursor: "pointer",
			border: "1px solid var(--dsw-alias-border-l2, #d8dee4)",
			background: "var(--dsw-alias-bg-layer-2, #f6f8fa)",
			color: "var(--dsw-alias-label-primary, #24292f)", whiteSpace: "nowrap",
			font: "inherit", lineHeight: "1.6"
		},
		triggerOpen: {
			borderColor: "#cf222e", color: "#cf222e",
			background: "color-mix(in srgb, #cf222e 10%, transparent)"
		},
		panel: {
			display: "flex", flexDirection: "column", gap: "7px",
			border: "1px solid var(--dsw-alias-border-l2, #d8dee4)",
			borderRadius: "10px", padding: "9px 11px",
			background: "var(--dsw-alias-bg-layer-2, #f6f8fa)",
			// 向上拉出：dock 在输入框上方，加高即向上生长。
			boxShadow: "0 -6px 16px rgba(0,0,0,.06)"
		},
		panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
		panelTitle: { fontWeight: 600, color: "var(--dsw-alias-label-primary, #24292f)" },
		hint: { opacity: 0.75, fontSize: "10.5px" },
		// 滑条本体：原生 range，键盘也能用。
		range: { width: "100%", accentColor: "#cf222e", cursor: "pointer" },
		scale: { display: "flex", justifyContent: "space-between", fontSize: "10.5px" },
		scaleStop: { opacity: 0.6 },
		scaleStopOn: { opacity: 1, fontWeight: 700, color: "#cf222e" },
		err: { color: "#cf222e", fontSize: "10.5px" },
		sep: { opacity: 0.5 },
		digest: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "46ch" },
		silent: { display: "none" }
	};

	function useSessionId(props) {
		const direct = props && typeof props.sessionId === "string" ? props.sessionId : "";
		if (direct !== "") return direct;
		try {
			const boot = globalThis.__DSH_BOOT__;
			if (boot && typeof boot.sessionId === "string" && boot.sessionId !== "") return boot.sessionId;
		} catch (error) {
			// 读不到就当作没有会话：挂件保持静默，不影响别的东西。
		}
		return "";
	}

	function clampStop(value) {
		const number = Number(value);
		if (!Number.isFinite(number)) return 2;
		return Math.min(STOPS.length - 1, Math.max(0, Math.round(number)));
	}

	function readStoredStop() {
		try {
			const raw = globalThis.localStorage && globalThis.localStorage.getItem(STORE_KEY);
			return raw === null ? null : clampStop(Number(raw));
		} catch (error) {
			return null;
		}
	}

	function writeStoredStop(index) {
		try {
			if (globalThis.localStorage) globalThis.localStorage.setItem(STORE_KEY, String(index));
		} catch (error) {
			// 存不上就只在内存里活着，不因此报错。
		}
	}

	/**
	 * 辣度状态：本地立刻响应，同时同步给宿主。
	 * 返回 { slider, level, note, sync, error }，sync 是 'pending' | 'ok' | 'local' | 'off'。
	 */
	function useStyleLevel(sessionId) {
		const state = react.useState(() => {
			const stored = readStoredStop();
			return { slider: stored === null ? 2 : stored, sync: "pending", error: "" };
		});
		const current = state[0];
		const setCurrent = state[1];

		// 挂载时和宿主对齐：宿主里真实生效的那份说了算，本地只是缓存。
		react.useEffect(() => {
			if (sessionId === "") return undefined;
			let alive = true;
			fetch(STYLE_ROUTE + "?session=" + encodeURIComponent(sessionId), { cache: "no-store" })
				.then((response) => (response.ok ? response.json() : Promise.reject(new Error("HTTP " + response.status))))
				.then((data) => {
					if (!alive || typeof data.slider !== "number") return;
					writeStoredStop(data.slider);
					setCurrent({ slider: clampStop(data.slider), sync: "ok", error: "" });
				})
				.catch(() => {
					// 宿主读不到就沿用本地值，不打断用户。
					if (alive) setCurrent((prev) => ({ ...prev, sync: "local" }));
				});
			return () => { alive = false; };
		}, [sessionId]);

		// 有的宿主（或测试替身）不一定带 useCallback：退化成普通函数，
		// 顶多多渲染一次，绝不因此崩掉输入框。
		const useStable = typeof react.useCallback === "function"
			? react.useCallback
			: (fn) => fn;

		const commit = useStable((nextIndex) => {
			const index = clampStop(nextIndex);
			writeStoredStop(index);
			setCurrent({ slider: index, sync: "pending", error: "" });
			if (sessionId === "") {
				setCurrent({ slider: index, sync: "local", error: "" });
				return;
			}
			fetch(STYLE_ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ session: sessionId, slider: index })
			})
				.then((response) => (response.ok ? response.json() : Promise.reject(new Error("HTTP " + response.status))))
				.then((data) => setCurrent({ slider: clampStop(data.slider ?? index), sync: "ok", error: "" }))
				.catch((error) => {
					// 没写进宿主就明说没写进去 —— 不做看起来能用的假控件。
					setCurrent({ slider: index, sync: "local", error: String((error && error.message) || error) });
				});
		}, [sessionId]);

		return [current, commit];
	}

	function useHeartbeat(sessionId) {
		const state = react.useState({ phase: sessionId === "" ? "idle" : "loading" });
		const current = state[0];
		const setCurrent = state[1];

		react.useEffect(() => {
			if (sessionId === "") return undefined;
			let alive = true;
			let timer = null;

			const tick = () => {
				fetch(ROUTE + "?session=" + encodeURIComponent(sessionId), { cache: "no-store" })
					.then((response) => (response.ok ? response.json() : Promise.reject(new Error("HTTP " + response.status))))
					.then((data) => { if (alive) setCurrent({ phase: "ready", data: data }); })
					.catch((error) => {
						// 门诊部下班了不该报错，静默降级成不显示。
						if (alive) setCurrent({ phase: "error", error: String((error && error.message) || error) });
					});
			};

			tick();
			timer = setInterval(tick, POLL_MS);
			return () => { alive = false; if (timer !== null) clearInterval(timer); };
		}, [sessionId]);

		return current;
	}

	/** 滑条面板：向上拉出的那一条。 */
	function StylePanel(props) {
		const level = props.level;
		const sync = props.sync;
		const error = props.error;
		const onPick = props.onPick;
		const onClose = props.onClose;

		const scale = STOPS.map((stop, index) =>
			react.createElement("span", {
				key: stop,
				style: index === props.slider ? S.scaleStopOn : S.scaleStop
			}, stop));

		return react.createElement("div", { style: S.panel, "data-bushaoxin": "style-panel" },
			react.createElement("div", { style: S.panelHead },
				react.createElement("span", { style: S.panelTitle }, SLIDER + " 文风强度"),
				react.createElement("button", {
					type: "button", style: Object.assign({}, S.trigger, { padding: "1px 8px" }),
					onClick: onClose, title: "收起"
				}, "\u2715")),
			react.createElement("input", {
				type: "range", min: 0, max: STOPS.length - 1, step: 1,
				value: props.slider, style: S.range,
				"aria-label": "不烧心文风强度",
				onChange: (event) => onPick(Number(event.target.value))
			}),
			react.createElement("div", { style: S.scale }, scale),
			react.createElement("div", { style: S.hint },
				"当前「" + level + "」· " + (STOP_NOTE[level] || ""),
				sync === "pending" ? " · 正在写入…" : "",
				sync === "local" ? " · 只存在本地（宿主没写进去）" : ""),
			sync === "local" && error !== ""
				? react.createElement("div", { style: S.err }, "未能同步到宿主：" + error)
				: null);
	}

	function Widget(props) {
		const sessionId = useSessionId(props);
		const current = useHeartbeat(sessionId);
		const styleState = useStyleLevel(sessionId);
		const style = styleState[0];
		const commit = styleState[1];
		const openState = react.useState(false);
		const open = openState[0];
		const setOpen = openState[1];

		// 没有会话也允许调滑条：那是纯本地偏好，调完刷新后仍在。
		const level = STOPS[style.slider] || "中";

		const trigger = react.createElement("button", {
			type: "button",
			style: Object.assign({}, S.trigger, open ? S.triggerOpen : {}),
			"aria-expanded": open ? "true" : "false",
			title: "点开选择文风强度",
			onClick: () => setOpen((prev) => !prev)
		}, GLYPH + " 不烧心 · " + level);

		// 直接调用而不是当组件传进 createElement：
		// StylePanel 不用任何 hook，直接调用得到的是一棵普通元素树，
		// 少一层组件边界，测试和真实渲染看到的是同一个东西。
		const panel = open
			? StylePanel({
				slider: style.slider, level: level, sync: style.sync, error: style.error,
				onPick: commit, onClose: () => setOpen(false)
			})
			: null;

		const heartbeat = (sessionId === "" || current.phase !== "ready")
			? null
			: (() => {
				const data = current.data || {};
				const color = TONE_COLOR[data.tone] || "#57606a";
				const prescription = Array.isArray(data.prescription) ? data.prescription[0] : data.dish;
				return react.createElement("div", { style: S.line, title: data.digest || "" },
					react.createElement("span", { style: Object.assign({}, S.badge, {
						color: color, borderColor: color, background: "transparent"
					}) }, (data.index === undefined ? "—" : data.index) + "/100"),
					react.createElement("span", null, data.grade || ""),
					react.createElement("span", { style: S.sep }, "·"),
					react.createElement("span", { style: S.digest },
						(data.visitLabel || "今日门诊") + " · " + (data.total || 0) + " 次进食" +
						((data.repeats || 0) > 0 ? " · 复诊 " + data.repeats + " 次" : "") +
						((data.errors || 0) > 0 ? " · 反酸 " + data.errors + " 次" : "")),
					prescription
						? react.createElement("span", null, react.createElement("span", { style: S.sep }, "·"), " " + PILL + " " + prescription)
						: null);
			})();

		return react.createElement("div", { style: S.root, "data-bushaoxin": "ready" },
			panel,
			react.createElement("div", { style: S.line }, trigger, heartbeat));
	}

	function apply(ctx) {
		ctx.effect(() => ctx.locale.register(NS, {
			zh: { nav: "不烧心", dock: "不烧心门诊部" },
			en: { nav: "No Heartburn", dock: "Heartburn Clinic" }
		}), "dsh-bushaoxin: dictionaries");

		// 只在 owner 声明了这个 slot 时注册：老版本 host 不声明，就自然不出现，不抛错。
		ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
			name: "conversation.composer.dock",
			id: "bushaoxin-clinic",
			// 排在自带条目（stats / cost-meter）后面，别抢位置。
			order: 20,
			label: () => "不烧心",
			locale: NS
		}, (props) => react.createElement(Widget, props)));
	}

	exports.apply = apply;
	exports.inject = inject;
	exports.name = name;
	return module.exports;
}
});
