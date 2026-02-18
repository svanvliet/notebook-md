import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Adds a drag handle that appears on the left side of block nodes.
 * Users can grab the handle to drag and reorder blocks.
 */
export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    let dragHandleEl: HTMLElement | null = null;
    let currentBlockPos: number | null = null;

    const createHandle = () => {
      const el = document.createElement('div');
      el.className = 'drag-handle';
      el.setAttribute('draggable', 'true');
      el.setAttribute('contenteditable', 'false');
      el.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
        <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
        <circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/>
        <circle cx="2" cy="12" r="1.5"/><circle cx="8" cy="12" r="1.5"/>
      </svg>`;
      el.style.display = 'none';
      return el;
    };

    return [
      new Plugin({
        key: new PluginKey('dragHandle'),
        view(editorView) {
          dragHandleEl = createHandle();
          const parent = editorView.dom.parentElement;
          if (parent) {
            parent.style.position = 'relative';
            parent.appendChild(dragHandleEl);
          }

          dragHandleEl.addEventListener('dragstart', (e) => {
            if (currentBlockPos === null) return;
            const { state } = editorView;
            const resolved = state.doc.resolve(currentBlockPos);
            const blockNode = resolved.parent === state.doc
              ? state.doc.nodeAt(currentBlockPos)
              : resolved.nodeAfter;
            if (!blockNode) return;

            // Select the node so ProseMirror's built-in drag handles it
            const from = currentBlockPos;
            const to = from + blockNode.nodeSize;
            const tr = state.tr.setSelection(
              state.selection.constructor === state.selection.constructor
                ? editorView.state.selection
                : state.selection,
            );
            editorView.dispatch(tr);

            // Set the drag slice
            const slice = state.doc.slice(from, to);
            editorView.dragging = { slice, move: true };
            e.dataTransfer?.setDragImage(dragHandleEl!, 0, 0);
          });

          return {
            update(view) {
              // handled via mousemove
            },
            destroy() {
              dragHandleEl?.remove();
              dragHandleEl = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              if (!dragHandleEl) return false;
              const editorRect = view.dom.getBoundingClientRect();
              const pos = view.posAtCoords({ left: editorRect.left + 1, top: event.clientY });
              if (!pos) {
                dragHandleEl.style.display = 'none';
                return false;
              }

              const resolved = view.state.doc.resolve(pos.pos);
              // Find the top-level block position
              let depth = resolved.depth;
              while (depth > 1) depth--;
              const blockStart = depth > 0 ? resolved.before(depth) : resolved.before(1);

              const blockDom = view.nodeDOM(blockStart);
              if (!blockDom || !(blockDom instanceof HTMLElement)) {
                dragHandleEl.style.display = 'none';
                return false;
              }

              const blockRect = blockDom.getBoundingClientRect();
              const parentRect = view.dom.parentElement!.getBoundingClientRect();

              currentBlockPos = blockStart;
              dragHandleEl.style.display = 'flex';
              dragHandleEl.style.top = `${blockRect.top - parentRect.top + 2}px`;
              dragHandleEl.style.left = '-24px';

              return false;
            },
            mouseleave(_view, _event) {
              // Hide after a delay to allow clicking the handle
              setTimeout(() => {
                if (dragHandleEl && !dragHandleEl.matches(':hover')) {
                  dragHandleEl.style.display = 'none';
                }
              }, 200);
              return false;
            },
          },
        },
      }),
    ];
  },
});
