import { Field, Select } from "@/components/ui/field";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { GroupListItemResponse } from "@/services/groups-api";

export const knowledgeClassificationValues = [
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;

export type KnowledgeClassification =
  (typeof knowledgeClassificationValues)[number];

export type KnowledgeOwnerMode = "user" | "group";

interface KnowledgeArticleAdminFieldsProperties {
  readonly users: readonly DirectoryUser[];
  readonly groups: readonly GroupListItemResponse[];
  readonly ownerMode: KnowledgeOwnerMode;
  readonly ownerUserId: string;
  readonly ownerGroupId: string;
  readonly reviewerUserId: string;
  readonly classification: KnowledgeClassification;
  readonly onOwnerModeChange: (mode: KnowledgeOwnerMode) => void;
  readonly onOwnerUserIdChange: (value: string) => void;
  readonly onOwnerGroupIdChange: (value: string) => void;
  readonly onReviewerUserIdChange: (value: string) => void;
  readonly onClassificationChange: (value: KnowledgeClassification) => void;
  readonly labels: {
    readonly ownerMode: string;
    readonly ownerUser: string;
    readonly ownerGroup: string;
    readonly reviewer: string;
    readonly classification: string;
    readonly selectPlaceholder: string;
    readonly ownerModeUser: string;
    readonly ownerModeGroup: string;
  };
}

export function KnowledgeArticleAdminFields({
  users,
  groups,
  ownerMode,
  ownerUserId,
  ownerGroupId,
  reviewerUserId,
  classification,
  onOwnerModeChange,
  onOwnerUserIdChange,
  onOwnerGroupIdChange,
  onReviewerUserIdChange,
  onClassificationChange,
  labels,
}: KnowledgeArticleAdminFieldsProperties) {
  return (
    <>
      <Field label={labels.ownerMode} required>
        <Select
          value={ownerMode}
          required
          onChange={(event) =>
            onOwnerModeChange(event.target.value as KnowledgeOwnerMode)
          }
        >
          <option value="user">{labels.ownerModeUser}</option>
          <option value="group">{labels.ownerModeGroup}</option>
        </Select>
      </Field>
      {ownerMode === "user" ? (
        <Field label={labels.ownerUser} required>
          <Select
            value={ownerUserId}
            required
            onChange={(event) => onOwnerUserIdChange(event.target.value)}
          >
            <option value="">{labels.selectPlaceholder}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label={labels.ownerGroup} required>
          <Select
            value={ownerGroupId}
            required
            onChange={(event) => onOwnerGroupIdChange(event.target.value)}
          >
            <option value="">{labels.selectPlaceholder}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={labels.reviewer}>
        <Select
          value={reviewerUserId}
          onChange={(event) => onReviewerUserIdChange(event.target.value)}
        >
          <option value="">{labels.selectPlaceholder}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={labels.classification} required>
        <Select
          value={classification}
          required
          onChange={(event) =>
            onClassificationChange(
              event.target.value as KnowledgeClassification,
            )
          }
        >
          {knowledgeClassificationValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
