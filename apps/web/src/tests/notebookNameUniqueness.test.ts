import { describe, it, expect } from 'vitest';

describe('Notebook Name Uniqueness', () => {
  // Simulates the validation logic used in AddNotebookModal
  function validateNotebookName(name: string, existingNames: string[]): string | null {
    const trimmed = name.trim();
    if (!trimmed) return 'Name is required';
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      return 'A notebook with this name already exists. Please choose a different name.';
    }
    return null;
  }

  // Simulates the validation logic used in NotebookTree commitRename
  function validateNotebookRename(
    newName: string,
    notebookId: string,
    notebooks: { id: string; name: string }[],
  ): string | null {
    const trimmed = newName.trim();
    if (!trimmed) return 'Name is required';
    const duplicate = notebooks.some(
      (n) => n.id !== notebookId && n.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) return 'A notebook with this name already exists';
    return null;
  }

  describe('AddNotebookModal validation', () => {
    const existing = ['My Notebook', 'GitHub Repo', 'Demo Notebook'];

    it('rejects empty name', () => {
      expect(validateNotebookName('', existing)).toBe('Name is required');
      expect(validateNotebookName('   ', existing)).toBe('Name is required');
    });

    it('rejects duplicate name (exact match)', () => {
      const error = validateNotebookName('My Notebook', existing);
      expect(error).toContain('already exists');
    });

    it('rejects duplicate name (case-insensitive)', () => {
      const error = validateNotebookName('my notebook', existing);
      expect(error).toContain('already exists');
    });

    it('accepts unique name', () => {
      expect(validateNotebookName('New Notebook', existing)).toBeNull();
    });

    it('trims whitespace before comparing', () => {
      expect(validateNotebookName('  New Notebook  ', existing)).toBeNull();
      const error = validateNotebookName('  My Notebook  ', existing);
      expect(error).toContain('already exists');
    });
  });

  describe('Rename validation', () => {
    const notebooks = [
      { id: 'nb-1', name: 'My Notebook' },
      { id: 'nb-2', name: 'GitHub Repo' },
      { id: 'nb-3', name: 'Demo Notebook' },
    ];

    it('allows renaming to the same name (same notebook)', () => {
      // Renaming nb-1 to "My Notebook" should be allowed (it's the same notebook)
      expect(validateNotebookRename('My Notebook', 'nb-1', notebooks)).toBeNull();
    });

    it('rejects renaming to an existing name (different notebook)', () => {
      const error = validateNotebookRename('GitHub Repo', 'nb-1', notebooks);
      expect(error).toContain('already exists');
    });

    it('rejects case-insensitive duplicate on rename', () => {
      const error = validateNotebookRename('github repo', 'nb-1', notebooks);
      expect(error).toContain('already exists');
    });

    it('accepts unique rename', () => {
      expect(validateNotebookRename('Renamed Notebook', 'nb-1', notebooks)).toBeNull();
    });
  });
});
