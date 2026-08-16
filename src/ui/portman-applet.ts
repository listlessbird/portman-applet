import { freePort, stopProcess } from "../ports/process-control.ts";
import { scanPorts } from "../ports/scan.ts";
import type { OpenPort, PortProcess } from "../ports/models.ts";
import { freeErrorMessage, scanErrorMessage, stopErrorMessage } from "./error-messages.ts";
import { PortMenuView } from "./port-menu.ts";

const Applet = imports.ui.applet;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;

const REFRESH_SECONDS = 2;

class PortmanApplet extends Applet.TextIconApplet {
  private readonly menu: PortMenuView;
  private refreshTimer: number | undefined;
  private refreshRequest = 0;

  constructor(orientation: string, panelHeight: number, instanceId: number) {
    super(orientation, panelHeight, instanceId);
    this.set_applet_icon_symbolic_name("network-server-symbolic");
    this.set_applet_label("…");
    this.set_applet_tooltip("Open ports");

    this.menu = new PortMenuView(this, orientation, {
      onRefresh: () => void this.refresh(),
      onScopeChange: () => void this.refresh(),
      onStop: (process, port) => void this.stop(process, port),
      onFree: (port) => void this.free(port),
    });

    void this.refresh();
  }

  override on_applet_clicked(): void {
    this.menu.toggle();
    if (this.menu.isOpen) {
      this.startRefreshTimer();
      void this.refresh();
    } else {
      this.stopRefreshTimer();
    }
  }

  override on_applet_removed_from_panel(): void {
    this.stopRefreshTimer();
    this.menu.destroy();
  }

  private startRefreshTimer(): void {
    if (this.refreshTimer !== undefined) return;
    this.refreshTimer = Mainloop.timeout_add_seconds(REFRESH_SECONDS, () => {
      void this.refresh();
      return true;
    });
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer === undefined) return;
    Mainloop.source_remove(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private async refresh(): Promise<void> {
    const request = ++this.refreshRequest;
    const result = await scanPorts(this.menu.showsSystemPorts);
    if (request !== this.refreshRequest) return;

    result.match({
      ok: (ports) => this.showPorts(ports),
      err: (error) => this.showScanError(scanErrorMessage(error)),
    });
  }

  private showPorts(ports: readonly OpenPort[]): void {
    this.menu.setPorts(ports);
    this.set_applet_label(String(ports.length));
    this.set_applet_tooltip(
      `${ports.length} open ${this.menu.showsSystemPorts ? "system" : "development"} ports`,
    );
  }

  private showScanError(message: string): void {
    this.menu.showError(message);
    this.set_applet_label("!");
    this.set_applet_tooltip(`Unable to inspect ports: ${message}`);
  }

  private async stop(process: PortProcess, port: number): Promise<void> {
    const result = await stopProcess(process);
    result.match({
      ok: (outcome) => {
        Main.notify(
          `Port ${port} is available`,
          outcome.escalated
            ? "The process required SIGKILL."
            : `${process.name} stopped gracefully.`,
        );
        void this.refresh();
      },
      err: (error) => Main.notify(`Could not stop ${process.name}`, stopErrorMessage(error)),
    });
  }

  private async free(port: OpenPort): Promise<void> {
    const result = await freePort(port);
    result.match({
      ok: (outcome) => {
        Main.notify(
          `Port ${port.port} is available`,
          outcome.escalated
            ? "Some processes required SIGKILL."
            : "All processes stopped gracefully.",
        );
        void this.refresh();
      },
      err: (error) => Main.notify(`Could not free port ${port.port}`, freeErrorMessage(error)),
    });
  }
}

export function main(
  _metadata: { readonly uuid: string },
  orientation: string,
  panelHeight: number,
  instanceId: number,
) {
  return new PortmanApplet(orientation, panelHeight, instanceId);
}
