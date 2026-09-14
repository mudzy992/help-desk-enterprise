import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { VisualQaSection } from "@/components/visual-qa/visual-qa-section";

export function VisualQaFormsBoard() {
  return (
    <>
      <VisualQaSection title="Field / Input / Select / Textarea">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Naziv" required hint="Label 12.5px, hint 11.5px">
            <Input defaultValue="Primjer unosa" />
          </Field>
          <Field label="Izbor">
            <Select defaultValue="a">
              <option value="a">Opcija A</option>
              <option value="b">Opcija B</option>
            </Select>
          </Field>
          <Field label="Opis" className="md:col-span-2">
            <Textarea defaultValue="Višelinijski unos" rows={3} />
          </Field>
        </div>
      </VisualQaSection>
      <VisualQaSection title="Progress">
        <div className="grid gap-3">
          <Progress value={72} />
          <Progress value={40} tone="warning" />
          <Progress value={18} tone="danger" />
        </div>
      </VisualQaSection>
    </>
  );
}
