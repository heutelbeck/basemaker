import { defaultFreeformSpec } from '../../params/freeform.ts';
import type { BaseShape } from '../../params/types.ts';
import { setBaseParams, useBaseParams } from '../../state/store.ts';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import { FreeformEditor } from './FreeformEditor.tsx';
import { Section } from './Section.tsx';
import { ShapeEditor, defaultShapeFor } from './ShapeEditor.tsx';

type BaseKind = 'standard' | 'converter' | 'freeform';

function baseKindOf(shape: BaseShape): BaseKind {
  if (shape.kind === 'converter') {
    return 'converter';
  }
  if (shape.kind === 'freeform') {
    return 'freeform';
  }
  return 'standard';
}

export function ShapePanel() {
  const shape = useBaseParams().shape;

  const setShape = (nextShape: BaseShape) => {
    setBaseParams((params) => ({ ...params, shape: nextShape }));
  };

  const switchKind = (kind: BaseKind) => {
    if (kind === baseKindOf(shape)) {
      return;
    }
    if (kind === 'standard') {
      setShape(shape.kind === 'converter' ? shape.outer : defaultShapeFor('round'));
    } else if (kind === 'converter') {
      setShape({
        kind: 'converter',
        outer:
          shape.kind !== 'converter' && shape.kind !== 'freeform'
            ? shape
            : defaultShapeFor('round'),
        insert: { kind: 'square', size: 25 },
        insertDepth: 3,
        clearance: 0.15,
      });
    } else {
      setBaseParams((params) => ({
        ...params,
        shape: defaultFreeformSpec(),
        edgeSlope: 0,
        lipRadius: 0,
      }));
    }
  };

  return (
    <Section title="Shape">
      <Select
        label="Base type"
        value={baseKindOf(shape)}
        options={[
          { value: 'standard', label: 'Standard shape' },
          { value: 'converter', label: 'Converter (pocket for another base)' },
          { value: 'freeform', label: 'Freeform drawing' },
        ]}
        onChange={(kind) => switchKind(kind as BaseKind)}
      />
      {shape.kind === 'converter' && (
        <>
          <fieldset className="subgroup">
            <legend>Outer base</legend>
            <ShapeEditor shape={shape.outer} onChange={(outer) => setShape({ ...shape, outer })} />
          </fieldset>
          <fieldset className="subgroup">
            <legend>Insert base</legend>
            <ShapeEditor
              shape={shape.insert}
              onChange={(insert) => setShape({ ...shape, insert })}
            />
          </fieldset>
          <div className="field-row">
            <NumberField
              label="Pocket depth"
              unit="mm"
              value={shape.insertDepth}
              min={0.5}
              step={0.5}
              onChange={(insertDepth) => setShape({ ...shape, insertDepth })}
            />
            <NumberField
              label="Clearance"
              unit="mm"
              value={shape.clearance}
              min={0}
              step={0.05}
              onChange={(clearance) => setShape({ ...shape, clearance })}
            />
          </div>
        </>
      )}
      {shape.kind === 'freeform' && (
        <FreeformEditor spec={shape} onChange={(spec) => setShape(spec)} />
      )}
      {shape.kind !== 'converter' && shape.kind !== 'freeform' && (
        <ShapeEditor shape={shape} onChange={setShape} />
      )}
    </Section>
  );
}
