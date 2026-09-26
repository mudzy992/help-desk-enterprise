import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import type { BadgeTone } from "@/components/ui/badge";

/*
  Paket 2.1 (M7): guidance only — the server decides. zxcvbn-ts and its
  dictionaries (~1 MB) load lazily, the first time a password is typed.
*/
type Scorer = (password: string) => number;
let scorerPromise: Promise<Scorer> | null = null;

function loadScorer(): Promise<Scorer> {
  scorerPromise ??= Promise.all([import("@zxcvbn-ts/core"), import("@zxcvbn-ts/language-common")]).then(
    ([core, common]) => {
      const factory = new core.ZxcvbnFactory({
        dictionary: { ...common.dictionary },
        graphs: common.adjacencyGraphs,
      });
      return (password: string) => factory.check(password).score;
    },
  );
  return scorerPromise;
}

const LEVELS = [
  { key: "auth.strength.veryWeak", tone: "danger", value: 10 },
  { key: "auth.strength.weak", tone: "danger", value: 30 },
  { key: "auth.strength.fair", tone: "warning", value: 55 },
  { key: "auth.strength.good", tone: "success", value: 80 },
  { key: "auth.strength.strong", tone: "success", value: 100 },
] as const satisfies readonly { key: string; tone: BadgeTone; value: number }[];

export function PasswordStrengthMeter({ password }: { readonly password: string }) {
  const { t } = useTranslation();
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (password.length === 0) {
      setScore(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      loadScorer()
        .then((scorer) => {
          if (active) setScore(scorer(password));
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [password]);

  if (score === null) return null;
  const level = LEVELS[Math.min(4, Math.max(0, score))];
  return (
    <div className="space-y-1" aria-live="polite">
      <Progress value={level.value} tone={level.tone} />
      <p className="text-[11.5px] text-muted-foreground">
        {t("auth.strength.label")}: {t(level.key)}
      </p>
    </div>
  );
}
