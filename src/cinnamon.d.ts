declare namespace CinnamonSt {
  interface RelayoutActor {
    get_children(): readonly RelayoutActor[];
    queue_relayout(): void;
  }

  interface EntryOptions {
    hint_text?: string;
    style_class?: string;
  }

  interface ClutterText {
    get_text(): string;
    connect(signal: "text-changed", callback: () => void): number;
  }

  class Entry {
    constructor(options: EntryOptions);
    clutter_text: ClutterText;
  }
}

declare namespace CinnamonApplet {
  class TextIconApplet {
    constructor(orientation: string, panelHeight: number, instanceId: number);
    set_applet_icon_symbolic_name(name: string): void;
    set_applet_label(label: string): void;
    set_applet_tooltip(text: string): void;
    on_applet_clicked(): void;
    on_applet_removed_from_panel(): void;
  }

  class AppletPopupMenu {
    constructor(launcher: TextIconApplet, orientation: string);
    readonly actor: CinnamonSt.RelayoutActor;
    connect(
      signal: "open-state-changed",
      callback: (menu: AppletPopupMenu, open: boolean) => void,
    ): number;
    addMenuItem(
      item:
        | CinnamonPopup.PopupBaseMenuItem
        | CinnamonPopup.PopupMenuItem
        | CinnamonPopup.PopupMenuSection
        | CinnamonPopup.PopupSeparatorMenuItem,
    ): void;
    toggle(): void;
    destroy(): void;
    isOpen: boolean;
  }
}

declare namespace CinnamonPopup {
  interface MenuItemOptions {
    reactive?: boolean;
  }

  class PopupMenuManager {
    constructor(launcher: CinnamonApplet.TextIconApplet);
    addMenu(menu: CinnamonApplet.AppletPopupMenu): void;
    destroy(): void;
  }

  class PopupBaseMenuItem {
    constructor(options?: MenuItemOptions);
    addActor(actor: CinnamonSt.Entry): void;
  }

  class PopupMenuItem {
    constructor(label: string, options?: MenuItemOptions);
    connect(signal: "activate", callback: () => void): number;
    setLabel(label: string): void;
  }

  class PopupSubMenuMenuItem {
    constructor(label: string);
    menu: PopupMenuSection;
  }

  class PopupMenuSection {
    readonly actor: CinnamonSt.RelayoutActor;
    readonly isOpen: boolean;
    connect(
      signal: "open-state-changed",
      callback: (menu: PopupMenuSection, open: boolean) => void,
    ): number;
    addMenuItem(item: PopupMenuItem | PopupSubMenuMenuItem | PopupSeparatorMenuItem): void;
    removeAll(): void;
  }

  class PopupSeparatorMenuItem {
    constructor();
  }
}

declare namespace CinnamonGio {
  const SubprocessFlags: {
    readonly SEARCH_PATH: number;
    readonly STDERR_PIPE: number;
    readonly STDOUT_PIPE: number;
  };

  interface AsyncResult {
    readonly __brand: "CinnamonAsyncResult";
  }

  interface Subprocess {
    get_successful(): boolean;
    communicate_utf8_async(
      stdin: null,
      cancellable: null,
      callback: (source: Subprocess, result: AsyncResult) => void,
    ): void;
    communicate_utf8_finish(result: AsyncResult): [boolean, string, string];
  }

  const Subprocess: {
    readonly new: (argv: string[], flags: number) => Subprocess;
  };
}

declare namespace CinnamonMainloop {
  function timeout_add_seconds(seconds: number, callback: () => boolean): number;
  function source_remove(id: number): void;
}

declare namespace CinnamonModalDialog {
  class ConfirmDialog {
    constructor(description: string, callback: () => void);
    open(): boolean;
  }
}

declare namespace CinnamonMain {
  function notify(title: string, details: string): void;
}

declare const imports: {
  readonly gi: {
    readonly Gio: typeof CinnamonGio;
    readonly St: typeof CinnamonSt;
  };
  readonly mainloop: typeof CinnamonMainloop;
  readonly ui: {
    readonly applet: typeof CinnamonApplet;
    readonly main: typeof CinnamonMain;
    readonly modalDialog: typeof CinnamonModalDialog;
    readonly popupMenu: typeof CinnamonPopup;
  };
};

declare function setTimeout(callback: () => void, milliseconds: number): number;
