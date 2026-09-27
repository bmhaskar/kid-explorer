/**
 * Kid Explorer — auto-menu launcher
 *
 * Pops the Quest Cards menu as soon as a session starts, so the child never has
 * to think of what to ask. Also adds /quest to re-deal the menu at any time.
 *
 * OFF by default, so the same file is safe on a parent's own machine.
 * Turn it on only in the child's shell:
 *
 *     export PI_KID_EXPLORER=1
 *
 * Install next to the skill:
 *     ~/.pi/agent/extensions/kid-explorer-autostart.ts
 *     ~/.pi/agent/skills/kid-explorer/SKILL.md
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ENABLE_ENV = "PI_KID_EXPLORER";

/** The prompt that makes the kid-explorer skill deal its opening hand. */
const OPENING_REQUEST =
	"Start the Kid Explorer quest. Load the kid-explorer skill, read " +
	"references/topic-bank.md, and deal 4 fresh Quest Cards — one History, one " +
	"Geography, one Animals, one Botany. Print the menu in the exact format from " +
	"SKILL.md, then stop and wait for me to pick. Remember: short turns, literal " +
	"language, one question at the end, and the content lens before anything you share.";

function enabled(): boolean {
	const v = process.env[ENABLE_ENV]?.trim().toLowerCase() ?? "";
	return v === "1" || v === "true" || v === "yes" || v === "on";
}

export default function (pi: ExtensionAPI) {
	if (!enabled()) return;

	// Re-deal the menu on demand.
	pi.registerCommand("quest", {
		description: "Deal a fresh set of 4 Kid Explorer quest cards",
		handler: async (_args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the answer to finish, then try /quest again.", "warning");
				return;
			}
			pi.sendUserMessage(OPENING_REQUEST);
		},
	});

	// A quick way out of a stuck topic.
	pi.registerCommand("wild", {
		description: "Ask Kid Explorer for one surprising true fact",
		handler: async (_args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait a moment, then try /wild again.", "warning");
				return;
			}
			pi.sendUserMessage("Wild card please: one surprising true fact from any subject.");
		},
	});

	// Deal the opening hand once the session is up. Deferred a tick so the TUI
	// has finished drawing and the session is genuinely idle.
	pi.on("session_start", (_event, ctx) => {
		setTimeout(() => {
			try {
				if (ctx.isIdle()) pi.sendUserMessage(OPENING_REQUEST);
			} catch {
				// Session already busy or shutting down — the menu can wait for /quest.
				ctx.ui.notify("Menu not ready yet. Type /quest when you are ready.", "info");
			}
		}, 400);
	});
}
