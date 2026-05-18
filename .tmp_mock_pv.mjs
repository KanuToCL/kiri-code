const verdict = { status: "pass", summary: "pv-test", findings: [], elapsedMs: 1 };
const result = "done " + "\`\`\`json " + JSON.stringify(verdict) + " \`\`\`";
console.log(JSON.stringify({ type: "result", result, total_cost_usd: 0.05 }));
