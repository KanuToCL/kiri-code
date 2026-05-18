import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("pi-discipline prompt", () => {
  it("test_t3_1_discipline_file_has_required_rules", async () => {
    const text = await readFile(path.resolve(__dirname, "../prompts/pi-discipline.md"), "utf8");
    expect(text).toMatch(/getsourcefile/);
    expect(text).toMatch(/Resume here/);
    expect(text).toMatch(/Never skip hooks/);
    expect(text).toMatch(/library bug/i);
    expect(text.length).toBeLessThan(2000);   // long discipline blocks dilute
  });
});

describe("post-edit-test extension", () => {
  it("test_t3_2_registers_handler_for_tool_execution_end", async () => {
    const ext = await import("../extensions/post-edit-test.js");
    let registeredEvent = "";
    const fakePi = { on: (e: string, _fn: any) => { registeredEvent = e; } };
    ext.default(fakePi as any);
    expect(registeredEvent).toMatch(/tool_execution|edit/);
  });

  it("test_t3_2_skips_non_code_files", async () => {
    const ext = await import("../extensions/post-edit-test.js");
    let handler: any;
    const fakePi = { on: (_e: string, fn: any) => { handler = fn; } };
    ext.default(fakePi as any);
    handler({ toolName: "edit", args: { path: "README.md" } });
    // Should not call sendUserMessage for non-code files
  });
});

describe("tool-call-lint hazards", () => {
  it("test_t3_3_sosfilt_zi_misuse_caught", async () => {
    const { HAZARDS } = await import("../extensions/tool-call-lint.js");
    const cmd = "python -c 'sosfilt_zi(sos, x, zi=zi)'";
    const hits = HAZARDS.filter(([re]) => re.test(cmd));
    expect(hits).toHaveLength(1);
  });

  it("test_t3_3_query_devices_kwarg_caught", async () => {
    const { HAZARDS } = await import("../extensions/tool-call-lint.js");
    const hits = HAZARDS.filter(([re]) => re.test("sd.query_devices(input=True)"));
    expect(hits).toHaveLength(1);
  });

  it("test_t3_3_clean_command_no_warning", async () => {
    const { HAZARDS } = await import("../extensions/tool-call-lint.js");
    const hits = HAZARDS.filter(([re]) => re.test("ls -la"));
    expect(hits).toHaveLength(0);
  });

  it("test_t3_3_invariant_each_hazard_has_msg", async () => {
    const { HAZARDS } = await import("../extensions/tool-call-lint.js");
    for (const entry of HAZARDS) {
      const msg = entry[1];
      expect(msg).toBeTypeOf("string");
      expect(msg.length).toBeGreaterThan(20);   // not empty/trivial
    }
  });
});

describe("reflect-before-act", () => {
  it("test_t3_4_registers_on_turn_start", async () => {
    const ext = await import("../extensions/reflect-before-act.js");
    let registeredEvent = "";
    const fakePi = { on: (e: string, _fn: any) => { registeredEvent = e; } };
    ext.default(fakePi as any);
    expect(registeredEvent).toBe("turn_start");
  });

  it("test_t3_4_reflect_fires_every_fifth_turn", async () => {
    const ext = await import("../extensions/reflect-before-act.js");
    const sent: string[] = [];
    let __cb: any;
    const fakePi: any = {
      on: (_e: string, cb: any) => { __cb = cb; },
      sendUserMessage: (m: string) => { sent.push(m); },
    };
    ext.default(fakePi);
    for (let i = 0; i < 11; i++) await __cb({ turnIndex: i });
    expect(sent).toHaveLength(3); // turns 0, 5, 10
    expect(sent[0]).toMatch(/Reflection/);
  });
});
