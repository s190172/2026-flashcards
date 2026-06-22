import React from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flashcard } from "../../types/appTypes";

export const SortableFlashcardItem = React.memo(function SortableFlashcardItem({ 
  card, 
  originalIndex, 
  handleDeleteCard, 
  isDark, 
  stylesObj 
}: { 
  card: Flashcard; 
  originalIndex: number; 
  handleDeleteCard: (id: string) => void; 
  isDark: boolean; 
  stylesObj: any;
  key?: string | number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  const cardBgStyle = isDragging 
    ? (isDark ? "bg-slate-900 border-indigo-500 shadow-2xl relative cursor-grabbing" : "bg-white border-indigo-600 shadow-2xl relative cursor-grabbing")
    : (isDark ? "bg-slate-950 border-slate-700 hover:border-slate-600 hover:shadow-md cursor-grab animate-fade-in" : "bg-white border-slate-400 hover:border-indigo-400 hover:shadow-md cursor-grab animate-fade-in");

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`p-4 rounded-xl flex justify-between items-start gap-3 ${isDragging ? '' : 'transition-all'} text-xs border-2 select-none ${cardBgStyle}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex gap-2 items-start flex-1 min-w-0">
        {/* Visual Grab Handle Indicator */}
        <div 
          className="text-slate-500 hover:text-indigo-400 p-1 rounded mt-0.5 shrink-0 transition-colors"
          title="Drag and drop card to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="space-y-1 flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-[10px] uppercase tracking-wider font-semibold ${isDark ? "text-indigo-400" : "text-indigo-700"}`}>
              #{originalIndex + 1} Term
            </span>
          </div>
          <h5 className={`font-bold text-sm selection:bg-indigo-500/30 break-words ${isDark ? "text-white" : "text-slate-950"}`}>
            {card.term}
          </h5>
          <p className={`${isDark ? "text-slate-400" : "text-slate-800"} selection:bg-indigo-500/30 leading-snug break-words`}>
            {card.definition}
          </p>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDeleteCard(card.id);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        className="text-slate-550 hover:text-rose-550 dark:text-slate-500 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer shrink-0 mt-0.5 relative z-20"
        title="Delete this study card"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
});
