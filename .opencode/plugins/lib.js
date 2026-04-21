/**
 * ApexYard OpenCode Plugin Utilities
 * Shared helper functions for all ApexYard plugins
 * Based on .claude/hooks/_lib-extract-pr.sh
 */

const path = require('path');
const { execSync } = require('child_process');

/**
 * Find the ops root directory (contains both onboarding.yaml and apexyard.projects.yaml)
 */
export const findOpsRoot = async (startDir) => {
  const fs = require('fs');
  let current = startDir;
  while (current !== '/' && current !== '') {
    try {
      if (fs.existsSync(path.join(current, 'onboarding.yaml')) && 
          fs.existsSync(path.join(current, 'apexyard.projects.yaml'))) {
        return current;
      }
    } catch (e) {
      // Ignore errors, continue walking
    }
    current = path.dirname(current);
  }
  return startDir;
};

/**
 * Check if a command is a merge command (gh pr merge or gh api .../pulls/N/merge)
 */
export const isMergeCommand = (cmd) => {
  if (!cmd) return false;
  return /\bgh\s+pr\s+merge\b/.test(cmd) ||
         /\bgh\s+api\b.*repos\/[^\/]+\/[^\/]+\/pulls\/[0-9]+\/merge\b/.test(cmd);
};

/**
 * Check if a command is gh pr create
 */
export const isPrCreate = (cmd) => {
  if (!cmd) return false;
  return /\bgh\s+pr\s+create\b/.test(cmd);
};

/**
 * Check if a command is git commit
 */
export const isCommit = (cmd) => {
  if (!cmd) return false;
  return /\bgit\s+commit\b/.test(cmd);
};

/**
 * Check if a command is git push
 */
export const isPush = (cmd) => {
  if (!cmd) return false;
  return /\bgit\s+push\b/.test(cmd);
};

/**
 * Check if a command is git add
 */
export const isGitAdd = (cmd) => {
  if (!cmd) return false;
  return /\bgit\s+add\b/.test(cmd);
};

/**
 * Check if a command is git branch
 */
export const isGitBranch = (cmd) => {
  if (!cmd) return false;
  return /\bgit\s+branch\b/.test(cmd);
};

/**
 * Extract PR number from a command string
 */
export const extractPrNumber = (cmd) => {
  if (!cmd) return null;
  
  // 1. gh api path: repos/owner/repo/pulls/N/merge
  const apiMatch = cmd.match(/repos\/[^\/]+\/[^\/]+\/pulls\/([0-9]+)\/merge/);
  if (apiMatch) return apiMatch[1];
  
  // 2. gh pr merge N
  const prMergeMatch = cmd.match(/\bgh\s+pr\s+merge\b[^|;&]*?([0-9]+)/);
  if (prMergeMatch) return prMergeMatch[1];
  
  // 3. Fallback: ask gh
  const root = getRepoRoot();
  try {
    const result = execSync('gh pr view --json number --jq .number', { encoding: 'utf8', stdio: 'pipe', cwd: root });
    return result.trim() || null;
  } catch (e) {
    return null;
  }
};

/**
 * Get the PR's HEAD SHA from GitHub
 */
export const resolvePrHead = (prNumber, repo = null) => {
  if (!prNumber) return null;
  const root = getRepoRoot();
  try {
    const args = repo ? ['pr', 'view', prNumber, '--repo', repo] : ['pr', 'view', prNumber];
    const result = execSync(`gh ${args.join(' ')} --json headRefOid --jq .headRefOid`, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: root
    });
    return result.trim() || null;
  } catch (e) {
    return null;
  }
};

/**
 * Get current git HEAD SHA
 */
export const getCurrentSha = () => {
  const root = getRepoRoot();
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: 'pipe', cwd: root }).trim();
  } catch (e) {
    return null;
  }
};

/**
 * Get current branch name
 */
export const getCurrentBranch = () => {
  const root = getRepoRoot();
  try {
    return execSync('git branch --show-current', { encoding: 'utf8', stdio: 'pipe', cwd: root }).trim();
  } catch (e) {
    return null;
  }
};

/**
 * Get repo root from current directory
 */
export const getRepoRoot = () => {
  try {
    const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: 'pipe' }).trim();
    return root || null;
  } catch (e) {
    return null;
  }
};

/**
 * Run gh command and return output
 */
export const runGh = (args) => {
  const root = getRepoRoot();
  try {
    return execSync(`gh ${args}`, { encoding: 'utf8', stdio: 'pipe', cwd: root }).trim();
  } catch (e) {
    return null;
  }
};

/**
 * Check if file exists
 */
export const fileExists = (filePath) => {
  const fs = require('fs');
  return fs.existsSync(filePath);
};

/**
 * Read file contents
 */
export const readFile = (filePath) => {
  const fs = require('fs');
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
};

/**
 * Check if path matches any of the given patterns
 */
export const matchesPatterns = (filePath, patterns) => {
  return patterns.some(pattern => {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // Regex
      return new RegExp(pattern.slice(1, -1)).test(filePath);
    }
    // Simple substring/prefix match
    return filePath.includes(pattern) || filePath.startsWith(pattern);
  });
};

/**
 * Default exempt path patterns for ticket-required hooks
 */
export const EXEMPT_PATTERNS = [
  '.claude/',
  'docs/',
  '/docs/',
  '.md'
];

/**
 * Check if path is exempt from ticket requirement
 */
export const isExempt = (filePath) => {
  return EXEMPT_PATTERNS.some(p => {
    if (p === '.md') return filePath.endsWith('.md');
    return filePath.startsWith(p) || filePath.includes(`/${p}`);
  });
};

/**
 * Architecture path patterns that require AgDR
 */
export const ARCH_PATTERNS = [
  /\.tf$/,
  /\.tfvars$/,
  /(^|\/)docker-compose.*\.ya?ml$/,
  /(^|\/)Dockerfile$/,
  /^\.github\/workflows\//
];

/**
 * UI path patterns that require design review
 */
export const UI_PATTERNS = [
  /\.tsx$/,
  /\.jsx$/,
  /\.vue$/,
  /\.svelte$/,
  /\.css$/,
  /\.scss$/,
  /\.sass$/,
  /\.less$/,
  /design-tokens/
];

/**
 * Valid commit types
 */
export const COMMIT_TYPES = [
  'feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'style', 'perf'
];

/**
 * Valid PR title types
 */
export const PR_TITLE_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'
];