// Shared types and utilities for Notebook.md
// This package is consumed by apps/web, apps/api, and apps/admin

export type SourceType = 'local' | 'onedrive' | 'google_drive' | 'github';

export type DisplayMode = 'light' | 'dark' | 'system';

export type DocumentMargins = 'narrow' | 'regular' | 'wide';

export interface UserSettings {
  displayMode: DisplayMode;
  editorFontFamily: string;
  editorFontSize: number;
  documentMargins: DocumentMargins;
  autoSaveDefault: boolean;
  spellCheck: boolean;
  lineNumbersInCodeBlocks: boolean;
  tabSize: 2 | 4;
  showWordCount: boolean;
  githubDeleteBranchOnPublish: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  displayMode: 'system',
  editorFontFamily: 'system-ui',
  editorFontSize: 16,
  documentMargins: 'regular',
  autoSaveDefault: false,
  spellCheck: true,
  lineNumbersInCodeBlocks: false,
  tabSize: 4,
  showWordCount: true,
  githubDeleteBranchOnPublish: true,
};

export interface NotebookConfig {
  id: string;
  name: string;
  sourceType: SourceType;
  sourceConfig: Record<string, unknown>;
  autoSave: boolean;
}
