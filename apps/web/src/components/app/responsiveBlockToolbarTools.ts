export const BLOCK_TOOL_IDS = {
  chat: 'chat',
  dispatchToAgent: 'dispatch-to-agent',
  references: 'references',
  share: 'share',
} as const;

type ResponsiveBlockToolIdentity = {
  id?: string;
  group?: string;
};

const HIDDEN_TOOL_IDS = new Set<string>([
  BLOCK_TOOL_IDS.chat,
  BLOCK_TOOL_IDS.dispatchToAgent,
  BLOCK_TOOL_IDS.references,
]);

function isShareTool(tool: ResponsiveBlockToolIdentity) {
  return tool.id === BLOCK_TOOL_IDS.share || tool.group === 'sharing';
}

function hasSameStableIdentity(
  left: ResponsiveBlockToolIdentity,
  right: ResponsiveBlockToolIdentity
) {
  return (
    (left.id !== undefined && left.id === right.id) ||
    (left.group !== undefined && left.group === right.group)
  );
}

/**
 * Classifies block tools without consulting their locale-dependent labels.
 * The sharing group remains a compatibility fallback for callers that have
 * not assigned the optional semantic id yet.
 */
export function arrangeResponsiveBlockTools<
  T extends ResponsiveBlockToolIdentity,
>(tools: readonly T[], menuTools?: readonly T[]) {
  const visibleTools = tools.filter(
    (tool) => tool.id === undefined || !HIDDEN_TOOL_IDS.has(tool.id)
  );
  const headerTools = visibleTools.filter(isShareTool);
  const toolbarTools = visibleTools.filter((tool) => !isShareTool(tool));

  if (!menuTools) {
    return { headerTools, toolbarTools, fileMenuTools: visibleTools };
  }

  const missingShareTools = visibleTools.filter(
    (tool) =>
      isShareTool(tool) &&
      !menuTools.some((menuTool) => hasSameStableIdentity(tool, menuTool))
  );

  return {
    headerTools,
    toolbarTools,
    fileMenuTools: [...menuTools, ...missingShareTools],
  };
}
