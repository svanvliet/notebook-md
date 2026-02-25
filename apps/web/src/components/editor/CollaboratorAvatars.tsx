import type { CollabUser } from '../../hooks/useCollaboration';

interface CollaboratorAvatarsProps {
  users: CollabUser[];
  maxVisible?: number;
}

/**
 * Renders connected collaborator avatars in the top bar.
 * Shows initials with user color, tooltip with name.
 */
export function CollaboratorAvatars({ users, maxVisible = 4 }: CollaboratorAvatarsProps) {
  if (users.length === 0) return null;

  const visible = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((user) => (
        <div
          key={user.id || user.name}
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white border-2 border-white dark:border-gray-900 cursor-default"
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          {getInitials(user.name)}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 bg-gray-200 dark:bg-gray-700 dark:text-gray-300 border-2 border-white dark:border-gray-900"
          title={`${overflow} more collaborator${overflow > 1 ? 's' : ''}`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
