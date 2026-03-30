// ========================================
// File: src/components/admin/fixtures/DraggableMatch.tsx
// ========================================

"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function DraggableMatch({ match, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: match.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}