// ========================================
// File: src/components/admin/fixtures/DraggableMatch.tsx
// ========================================

"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type DraggableMatchProps = {
  match: {
    id: string;
  };
  children: ReactNode;
};

export default function DraggableMatch({
  match,
  children,
}: DraggableMatchProps) {
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