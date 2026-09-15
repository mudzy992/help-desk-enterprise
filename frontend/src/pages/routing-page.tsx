import { Plus, Route as RouteIcon, Table2, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutingCoveragePanel } from "@/components/routing/routing-coverage-panel";
import { RoutingResolutionTester } from "@/components/routing/routing-resolution-tester";
import { RoutingRulesPanel } from "@/components/routing/routing-rules-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";

export function RoutingPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("coverage");

  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("routing.title")]}
        title={t("routing.title")}
        subtitle={t("routing.intro")}
        actions={
          <Button variant="primary" size="sm" onClick={() => setTab("rules")}>
            <Plus size={14} /> {t("routing.newRule")}
          </Button>
        }
      />
      <UnderlineTabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        items={[
          {
            key: "coverage",
            label: (
              <span className="flex items-center gap-1.5">
                <Table2 size={13} /> {t("routing.tabCoverage")}
              </span>
            ),
          },
          {
            key: "tester",
            label: (
              <span className="flex items-center gap-1.5">
                <Zap size={13} /> {t("routing.tabTester")}
              </span>
            ),
          },
          {
            key: "rules",
            label: (
              <span className="flex items-center gap-1.5">
                <RouteIcon size={13} /> {t("routing.tabRules")}
              </span>
            ),
          },
        ]}
      />
      {tab === "tester" ? (
        <RoutingResolutionTester />
      ) : tab === "rules" ? (
        <RoutingRulesPanel />
      ) : (
        <RoutingCoveragePanel onCreateRule={() => setTab("rules")} />
      )}
    </section>
  );
}
