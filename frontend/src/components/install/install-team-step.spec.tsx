// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallTeamStep } from "@/components/install/install-team-step";
import { ApiError } from "@/services/api";
import { loadInstallTeam, saveInstallTeam } from "@/services/install-team-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-team-api", () => ({
  loadInstallTeam: vi.fn(),
  saveInstallTeam: vi.fn(),
}));

const founderOnly = {
  members: [
    {
      userId: "user-2",
      displayName: "Super Admin",
      email: "admin@example.com",
      roleKey: "SUPER_ADMIN",
      isSuperAdmin: true,
    },
  ],
  groupName: "Fallback",
  maxMembers: 25,
  isTeamInvited: false,
};

const invited = {
  members: [
    ...founderOnly.members,
    {
      userId: "invited-1",
      displayName: "Amina Hodžić",
      email: "amina@example.com",
      roleKey: "AGENT",
      isSuperAdmin: false,
    },
  ],
  groupName: "Fallback",
  maxMembers: 25,
  isTeamInvited: true,
};

/**
 * F2 + owner decision 2: without SMTP the temporary password is shown once,
 * right after creation — a reload only lists the people, never their secrets.
 * F3 moved „Podesi kasnije“ from this step to the shell footer, so the deferral
 * itself is covered by `pages/install-page.spec.tsx`.
 */
describe("InstallTeamStep", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallTeam).mockReset();
    vi.mocked(saveInstallTeam).mockReset();
  });

  it("shows the temporary password once and drops it after the dialog is closed", async () => {
    vi.mocked(loadInstallTeam).mockResolvedValue({ team: founderOnly });
    vi.mocked(saveInstallTeam).mockResolvedValue({
      ...invited,
      created: [
        {
          userId: "invited-1",
          displayName: "Amina Hodžić",
          email: "amina@example.com",
          roleKey: "AGENT",
          temporaryPassword: "privremena-lozinka-1",
          temporaryPasswordDelivery: "ui",
        },
      ],
    });

    render(<InstallTeamStep />);
    fireEvent.change(await screen.findByLabelText("install.team.displayName 1"), {
      target: { value: "Amina Hodžić" },
    });
    fireEvent.change(screen.getByLabelText("install.team.email 1"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "install.team.submit" }));

    expect(await screen.findByText("privremena-lozinka-1")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "install.team.credentialsTitle" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "install.team.credentialsClose" }));
    await waitFor(() => expect(screen.queryByText("privremena-lozinka-1")).toBeNull());
    expect(screen.getByText(/amina@example.com/)).toBeTruthy();
  });

  it("lists a member whose password went out by e-mail without a password", async () => {
    vi.mocked(loadInstallTeam).mockResolvedValue({ team: founderOnly });
    vi.mocked(saveInstallTeam).mockResolvedValue({
      ...invited,
      created: [
        {
          userId: "invited-1",
          displayName: "Amina Hodžić",
          email: "amina@example.com",
          roleKey: "AGENT",
          temporaryPassword: null,
          temporaryPasswordDelivery: "email",
        },
      ],
    });

    render(<InstallTeamStep />);
    fireEvent.change(await screen.findByLabelText("install.team.displayName 1"), {
      target: { value: "Amina Hodžić" },
    });
    fireEvent.change(screen.getByLabelText("install.team.email 1"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "install.team.submit" }));

    expect((await screen.findByRole("dialog")).textContent).toContain(
      "install.team.credentialsEmailed",
    );
    expect(screen.getByText("install.team.credentialsEmailSent")).toBeTruthy();
  });

  it("names an address that is already taken", async () => {
    vi.mocked(loadInstallTeam).mockResolvedValue({ team: founderOnly });
    vi.mocked(saveInstallTeam).mockRejectedValue(
      new ApiError(409, "INSTALL_TEAM_EMAIL_CONFLICT", "taken"),
    );

    render(<InstallTeamStep />);
    fireEvent.change(await screen.findByLabelText("install.team.displayName 1"), {
      target: { value: "Amina Hodžić" },
    });
    fireEvent.change(screen.getByLabelText("install.team.email 1"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "install.team.submit" }));

    expect((await screen.findByRole("alert")).textContent).toBe("install.team.errorEmailTaken");
  });
});
