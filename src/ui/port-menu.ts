import type { OpenPort, PortProcess } from "../ports/models.ts";

const ModalDialog = imports.ui.modalDialog;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;

export interface PortMenuActions {
  readonly onRefresh: () => void;
  readonly onScopeChange: (includeSystemPorts: boolean) => void;
  readonly onStop: (process: PortProcess, port: number) => void;
  readonly onFree: (port: OpenPort) => void;
}

/** Owns the Cinnamon menu projection of the current port state. */
export class PortMenuView {
  private readonly menu: CinnamonApplet.AppletPopupMenu;
  private readonly menuManager: CinnamonPopup.PopupMenuManager;
  private readonly portSection: CinnamonPopup.PopupMenuSection;
  private readonly searchEntry: CinnamonSt.Entry;
  private readonly actions: PortMenuActions;
  private ports: readonly OpenPort[] = [];
  private includeSystemPorts = false;
  private filter = "";

  constructor(
    launcher: CinnamonApplet.TextIconApplet,
    orientation: string,
    actions: PortMenuActions,
  ) {
    this.actions = actions;
    this.menuManager = new PopupMenu.PopupMenuManager(launcher);
    this.menu = new Applet.AppletPopupMenu(launcher, orientation);
    this.menuManager.addMenu(this.menu);

    const searchItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    this.searchEntry = new St.Entry({
      hint_text: "Search ports or processes…",
      style_class: "portman-search",
    });
    searchItem.addActor(this.searchEntry);
    this.searchEntry.clutter_text.connect("text-changed", () => {
      this.filter = this.searchEntry.clutter_text.get_text().trim().toLowerCase();
      this.render();
    });

    this.portSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(searchItem);
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    this.menu.addMenuItem(this.portSection);
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const refreshItem = new PopupMenu.PopupMenuItem("Refresh");
    refreshItem.connect("activate", this.actions.onRefresh);
    this.menu.addMenuItem(refreshItem);

    const scopeItem = new PopupMenu.PopupMenuItem("Show system ports");
    scopeItem.connect("activate", () => {
      this.includeSystemPorts = !this.includeSystemPorts;
      scopeItem.setLabel(this.includeSystemPorts ? "Show development ports" : "Show system ports");
      this.actions.onScopeChange(this.includeSystemPorts);
    });
    this.menu.addMenuItem(scopeItem);
  }

  get isOpen(): boolean {
    return this.menu.isOpen;
  }

  get showsSystemPorts(): boolean {
    return this.includeSystemPorts;
  }

  toggle(): void {
    this.menu.toggle();
  }

  destroy(): void {
    this.menu.destroy();
    this.menuManager.destroy();
  }

  setPorts(ports: readonly OpenPort[]): void {
    this.ports = ports;
    this.render();
  }

  showError(message: string): void {
    this.ports = [];
    this.portSection.removeAll();
    this.portSection.addMenuItem(
      new PopupMenu.PopupMenuItem(`Unable to inspect ports: ${message}`, { reactive: false }),
    );
    this.queueRelayout();
  }

  private render(): void {
    this.portSection.removeAll();
    const visiblePorts = this.ports.filter(
      (port) => this.filter === "" || portSearchText(port).includes(this.filter),
    );

    if (visiblePorts.length === 0) {
      const emptyMessage =
        this.ports.length === 0 ? "No listening TCP ports" : "No ports match this search";
      this.portSection.addMenuItem(new PopupMenu.PopupMenuItem(emptyMessage, { reactive: false }));
      this.queueRelayout();
      return;
    }

    this.portSection.addMenuItem(
      new PopupMenu.PopupMenuItem(
        `${this.includeSystemPorts ? "All" : "Development"} ports · ${visiblePorts.length}`,
        { reactive: false },
      ),
    );

    for (const port of visiblePorts) this.addPortMenuItem(port);
    this.queueRelayout();
  }

  /**
   * Port data arrives asynchronously while the popup can already be open.
   * Cinnamon 6.6 does not requeue this allocation from setColumnWidths(), so
   * explicitly invalidate both levels after replacing section children.
   */
  private queueRelayout(): void {
    for (const child of this.portSection.actor.get_children()) child.queue_relayout();
    this.portSection.actor.queue_relayout();
    this.menu.actor.queue_relayout();
  }

  private addPortMenuItem(port: OpenPort): void {
    const primary = port.processes[0];
    const processName = primary?.name ?? "Owner unavailable";
    const suffix = port.processes.length > 1 ? ` +${port.processes.length - 1}` : "";
    const portItem = new PopupMenu.PopupSubMenuMenuItem(`${port.port} · ${processName}${suffix}`);
    portItem.menu.addMenuItem(
      new PopupMenu.PopupMenuItem(`${port.host} · TCP`, { reactive: false }),
    );

    for (const process of port.processes) {
      const detail = [processLabel(process), process.user, process.command]
        .filter(Boolean)
        .join(" · ");
      portItem.menu.addMenuItem(new PopupMenu.PopupMenuItem(detail, { reactive: false }));
    }

    this.portSection.addMenuItem(portItem);

    if (primary === undefined) {
      portItem.menu.addMenuItem(
        new PopupMenu.PopupMenuItem("Owner unavailable; try elevated inspection", {
          reactive: false,
        }),
      );
      return;
    }

    const protectedProcess = port.processes.find(
      (process) => process.protectedReason !== undefined,
    );
    if (protectedProcess !== undefined) {
      portItem.menu.addMenuItem(
        new PopupMenu.PopupMenuItem(`Protected: ${protectedProcess.protectedReason}`, {
          reactive: false,
        }),
      );
      return;
    }

    for (const process of port.processes) {
      const stopItem = new PopupMenu.PopupMenuItem(`Stop ${process.name} · PID ${process.pid}`);
      stopItem.connect("activate", () => this.confirmStop(process, port.port));
      portItem.menu.addMenuItem(stopItem);
    }

    const freeItem = new PopupMenu.PopupMenuItem(
      port.processes.length === 1
        ? `Free port ${port.port}`
        : `Free port ${port.port} · all processes`,
    );
    freeItem.connect("activate", () => this.confirmFree(port));
    portItem.menu.addMenuItem(freeItem);
  }

  private confirmStop(process: PortProcess, port: number): void {
    const dialog = new ModalDialog.ConfirmDialog(
      `Stop ${process.name} (PID ${process.pid}) listening on port ${port}?\n\nThe process will receive SIGTERM first.`,
      () => this.actions.onStop(process, port),
    );
    dialog.open();
  }

  private confirmFree(port: OpenPort): void {
    const dialog = new ModalDialog.ConfirmDialog(
      `Free port ${port.port}?\n\nThis will stop ${port.processes.length} process${port.processes.length === 1 ? "" : "es"}.`,
      () => this.actions.onFree(port),
    );
    dialog.open();
  }
}

function processLabel(process: PortProcess): string {
  return `${process.name} · PID ${process.pid}`;
}

function portSearchText(port: OpenPort): string {
  return [
    String(port.port),
    port.host,
    ...port.processes.flatMap((process) => [
      process.name,
      String(process.pid),
      process.user ?? "",
      process.command ?? "",
    ]),
  ]
    .join(" ")
    .toLowerCase();
}
