import { CREATIVE_SKILLS, allCreativeSkills } from '../../agent/skills/skills-catalog';
import { Icon } from '../icons';

interface WorkflowPickerContentProps {
  creativeMode: string | null;
  onCreativeModeChange: (id: string | null) => void;
  onRequestFocus: () => void;
  onClose: () => void;
}

export function WorkflowPickerContent({
  creativeMode,
  onCreativeModeChange,
  onRequestFocus,
  onClose,
}: WorkflowPickerContentProps) {
  const builtinIds = new Set(CREATIVE_SKILLS.map((skill) => skill.id));
  const skillName = (skill: { name: string; nameZh: string }) => (
    skill.name
  );

  return (
    <>
      <div className="cc-creative-picker-head">
        <span><Icon name="wand" size={15} /></span>
        <div>
          <strong>Choose a creative workflow</strong>
          <small>The workflow guides the Agent's planning and tool use.</small>
        </div>
      </div>
      <button
        type="button"
        onClick={() => { onCreativeModeChange(null); onClose(); }}
        className="cc-creative-mode-row"
        data-active={!creativeMode}
        aria-pressed={!creativeMode}
      >
        <span className="cc-creative-mode-icon"><Icon name="sparkles" size={15} /></span>
        <span className="cc-creative-mode-copy">
          <strong>Freeform</strong>
          <small>Work flexibly from the current goal without a fixed workflow.</small>
        </span>
        {!creativeMode && <span className="cc-creative-mode-check"><Icon name="check" size={13} strokeWidth={2.4} /></span>}
      </button>
      <div className="cc-creative-picker-section">Specialized workflows</div>
      <div className="cc-creative-mode-grid">
        {allCreativeSkills().map((skill) => (
          <button
            type="button"
            key={skill.id}
            onClick={() => {
              // Selecting a workflow activates it without touching the
              // composer text — the user writes their own task.
              onCreativeModeChange(skill.id);
              onRequestFocus();
              onClose();
            }}
            className="cc-creative-mode-row cc-creative-mode-card"
            data-active={creativeMode === skill.id}
            aria-pressed={creativeMode === skill.id}
            title={skill.summary}
          >
            <span className="cc-creative-mode-icon"><Icon name="wand" size={15} /></span>
            <span className="cc-creative-mode-copy">
              <span className="cc-creative-mode-title">
                <strong>{skillName(skill)}</strong>
                {!builtinIds.has(skill.id) && <em>Custom</em>}
              </span>
              <small>{skill.summary}</small>
            </span>
            {creativeMode === skill.id && <span className="cc-creative-mode-check"><Icon name="check" size={13} strokeWidth={2.4} /></span>}
          </button>
        ))}
      </div>
    </>
  );
}
