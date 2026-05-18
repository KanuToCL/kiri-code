import { execSync } from "child_process";

export function detectAuditorBranch(repoRoot: string, beforeSha: string): { branch: string; commits: string[] } | null {
  const branches = execSync("git branch --list 'consult/*' --format='%(refname:short)'", {
    cwd: repoRoot, encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  for (const branch of branches) {
    const commits = execSync(`git log ${beforeSha}..${branch} --format=%H`, {
      cwd: repoRoot, encoding: "utf8",
    }).trim().split("\n").filter(Boolean);
    if (commits.length > 0) return { branch, commits };
  }
  return null;
}
