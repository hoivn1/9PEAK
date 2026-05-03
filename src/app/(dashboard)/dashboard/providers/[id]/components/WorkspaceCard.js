"use client";

import PropTypes from "prop-types";
import ConnectionRow from "../ConnectionRow";
import { isConnectionDown } from "@/lib/codexWorkspace";

function MemberRow({
  connection,
  proxyPools,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onUpdateProxy,
  onEdit,
  onDelete,
  dim,
}) {
  return (
    <div className={`flex items-stretch transition-opacity ${dim ? "opacity-70" : ""}`}>
      <div className="flex-1 min-w-0">
        <ConnectionRow
          connection={connection}
          proxyPools={proxyPools}
          isOAuth={true}
          isFirst={isFirst}
          isLast={isLast}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onToggleActive={onToggleActive}
          onUpdateProxy={onUpdateProxy}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

MemberRow.propTypes = {
  connection: PropTypes.object.isRequired,
  proxyPools: PropTypes.array,
  isFirst: PropTypes.bool,
  isLast: PropTypes.bool,
  onMoveUp: PropTypes.func,
  onMoveDown: PropTypes.func,
  onToggleActive: PropTypes.func,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  dim: PropTypes.bool,
};

export default function WorkspaceCard({
  group,
  proxyPools,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onUpdateProxy,
  onEdit,
  onDelete,
  headerExtra,
}) {
  const cascade = group?.cascade || { triggered: false };
  const orderedMembers = group.members || [];

  return (
    <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-bg-elevated/40 p-3 mb-3">
      {headerExtra && <div className="flex justify-end mb-2">{headerExtra}</div>}

      <div className="flex flex-col divide-y divide-black/[0.03] dark:divide-white/[0.03]">
        {orderedMembers.map((conn, idx) => {
          const dim = !!cascade.triggered && !isConnectionDown(conn);
          return (
            <MemberRow
              key={conn.id}
              connection={conn}
              proxyPools={proxyPools}
              isFirst={idx === 0}
              isLast={idx === orderedMembers.length - 1}
              onMoveUp={() => onMoveUp?.(conn.id)}
              onMoveDown={() => onMoveDown?.(conn.id)}
              onToggleActive={(isActive) => onToggleActive?.(conn.id, isActive)}
              onUpdateProxy={(proxyPoolId) => onUpdateProxy?.(conn.id, proxyPoolId)}
              onEdit={() => onEdit?.(conn)}
              onDelete={() => onDelete?.(conn.id)}
              dim={dim}
            />
          );
        })}
      </div>
    </div>
  );
}

WorkspaceCard.propTypes = {
  group: PropTypes.shape({
    id: PropTypes.string,
    title: PropTypes.string,
    planType: PropTypes.string,
    personal: PropTypes.bool,
    members: PropTypes.array,
    owner: PropTypes.object,
    ownerCount: PropTypes.number,
    memberCount: PropTypes.number,
    healthyCount: PropTypes.number,
    cascade: PropTypes.object,
  }).isRequired,
  proxyPools: PropTypes.array,
  onMoveUp: PropTypes.func,
  onMoveDown: PropTypes.func,
  onToggleActive: PropTypes.func,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  headerExtra: PropTypes.node,
};
