import { GitHubIcon, OneDriveIcon, GoogleDriveIcon, AppleIcon, DeviceIcon, CloudOffIcon } from '../icons/Icons';

export type SourceType = 'local' | 'github' | 'onedrive' | 'google-drive' | 'icloud';

interface SourceTypeInfo {
  label: string;
  icon: typeof GitHubIcon;
  color: string; // Tailwind text color class
  available: boolean;
}

export const SOURCE_TYPES: Record<SourceType, SourceTypeInfo> = {
  local: {
    label: 'Local (Browser)',
    icon: DeviceIcon,
    color: 'text-gray-500',
    available: true,
  },
  github: {
    label: 'GitHub',
    icon: GitHubIcon,
    color: 'text-gray-800 dark:text-white',
    available: true,
  },
  onedrive: {
    label: 'OneDrive',
    icon: OneDriveIcon,
    color: 'text-blue-500',
    available: false,
  },
  'google-drive': {
    label: 'Google Drive',
    icon: GoogleDriveIcon,
    color: 'text-green-500',
    available: false,
  },
  icloud: {
    label: 'iCloud',
    icon: AppleIcon,
    color: 'text-gray-600 dark:text-gray-300',
    available: false,
  },
};

export function SourceIcon({ sourceType, className = 'w-4 h-4' }: { sourceType: SourceType; className?: string }) {
  const info = SOURCE_TYPES[sourceType];
  if (!info) {
    return <CloudOffIcon className={className} />;
  }
  const Icon = info.icon;
  return <Icon className={`${className} ${info.color}`} />;
}
