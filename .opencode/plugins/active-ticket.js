/**
 * ApexYard OpenCode Plugin: Active Ticket Enforcement
 * 
 * Blocks Edit/Write/MultiEdit on code paths when no active ticket is set.
 * Based on .claude/hooks/require-active-ticket.sh
 * 
 * This plugin provides the same enforcement as the Claude Code hook:
 * - Blocks code edits without an active ticket
 * - Uses two-tier marker resolution (per-project + fallback)
 * - Exempts .claude/, docs/, projects/asterisk docs/asterisk, .md files
 */

import { fileExists, findOpsRoot, getRepoRoot } from './lib.js';

export const ActiveTicketPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const blockedTools = ['Edit', 'Write', 'MultiEdit'];
      if (!blockedTools.includes(input.tool)) return;
      
      const filePath = input.args?.file_path || input.args?.path;
      if (!filePath) return;
      
      // Normalize to repo-relative path
      const repoRoot = getRepoRoot();
      let relPath = filePath;
      if (repoRoot && filePath.startsWith(repoRoot)) {
        relPath = filePath.slice(repoRoot.length + 1);
      }
      
      // Check exempt paths
      const exemptPatterns = [
        '.claude',
        'docs',
        'TODO.md',
        'README.md',
        'MEMORY.md',
        'CLAUDE.md'
      ];
      
      for (const pattern of exemptPatterns) {
        if (relPath === pattern || relPath.startsWith(pattern + '/')) return;
      }
      if (relPath.endsWith('.md')) return;
      if (relPath.includes('/docs/')) return;
      
      // Find ops root
      const opsRoot = await findOpsRoot(repoRoot || directory);
      
      // Per-project marker resolution
      let markerPath = null;
      if (opsRoot && filePath.includes('/workspace/')) {
        const match = filePath.match(/\/workspace\/([^/]+)/);
        if (match) {
          const projectName = match[1];
          const perProjectMarker = `${opsRoot}/.claude/session/tickets/${projectName}`;
          if (fileExists(perProjectMarker)) {
            markerPath = perProjectMarker;
          }
        }
      }
      
      // Fallback to current-ticket
      if (!markerPath) {
        const fallbackMarker = `${opsRoot || '.'}/.claude/session/current-ticket`;
        if (fileExists(fallbackMarker)) {
          markerPath = fallbackMarker;
        }
      }
      
      // Block if no marker found
      if (!markerPath) {
        const perProjectMsg = filePath.includes('/workspace/') 
          ? `  per-project:  ${opsRoot}/.claude/session/tickets/<project>`
          : '';
        
        throw new Error(`BLOCKED: No active ticket set for this session.

ApexYard requires a ticket BEFORE code edits (workflow-gates rule #3,
pre-build gate, "one ticket at a time"). To proceed:

  1. Create or find the ticket (GitHub Issue in the project's own repo):
       gh issue create --repo <owner/repo> --title "..."
  2. Declare it for this session — run the /start-ticket skill with the
     issue number (or pass owner/repo#number to pin it).
  3. Retry the edit

Markers looked up for this path (in order):
${perProjectMsg}  ops fallback: ${opsRoot || '.'}/.claude/session/current-ticket

Exempt paths (no ticket required): .claude/, docs/, projects/*/docs/, *.md`);
      }
    }
  };
};

export default ActiveTicketPlugin;