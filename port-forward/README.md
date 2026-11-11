# port-forward

A [Paseo](https://paseo.sh) plugin that forwards ports from remote Paseo hosts to `localhost` on your own machine. A dev server that listens on `localhost:3000` on a remote host becomes `http://localhost:3000` on your computer.

## How it works

```
Browser on your machine
  → localhost:3000 (local daemon, port-forward plugin)
    → connected host route (local daemon → remote daemon)
      → port-forward plugin on the remote daemon
        → 127.0.0.1:3000 on the remote host
```

The same plugin runs on both daemons. The local daemon listens on `127.0.0.1` and sends each connection through its connection to the remote daemon. The remote daemon connects to the port on its own `127.0.0.1`. No extra ports, SSH tunnels or firewall changes are needed.

## Requirements

- Paseo 0.14.0 or later on all daemons.
- Plugins enabled on all daemons: `"pluginsEnabled": true` in `~/.paseo/config.json`, then `paseo reload`.
- `npm` on the PATH of each daemon, for the install from GitHub.

## Setup

### 1. Install the plugin on the local daemon and on each remote daemon

```bash
paseo plugin install github:jakolehm/paseo-plugins:port-forward
paseo plugin install github:jakolehm/paseo-plugins:port-forward --host ssh://user@remote-host
```

### 2. Connect the local daemon to each remote host

**This step is necessary.** The hosts that you add in the Paseo app are not known to the local daemon. The app connects to them directly. The plugin runs in the local daemon, so the local daemon needs its own connection to each remote host:

```bash
paseo host add ssh://user@remote-host --label devbox
paseo host ls
```

The connection can be SSH, `host:port`, or a Paseo pairing link (`paseo pair` on the remote host prints one). Wait until `paseo host ls` shows the host as `online`. If this step is missing, the Port forwards screen shows **No connected hosts**. Keep the host in the app too, to work on it there.

## Use

Open **Port forwards** in the Paseo sidebar while your local host is selected.

- **Active forwards** shows each forward, its local address and its open connections. Open a forward in your browser, or stop it.
- Each connected host shows the ports that listen on it and are in the auto-forward port list. Select the forward button to forward a port. **Show other ports** shows all listening ports, and **Other port** forwards a port by number.

## Auto-forward

Turn on **Settings → Port forward → Forward new remote ports** for your local host to forward remote ports when they start to listen. An auto forward stops when its remote port closes, or when you turn auto-forward off. Manual forwards stay until you stop them. Only ports in the **Ports** list are forwarded. The default list is `3000-3999, 5173, 8000-8999`. Auto-forward is off by default.

If you stop an auto forward, it stays stopped until the remote port closes.

## Port conflicts

If a port is already in use on your machine, the plugin uses a free local port instead. The sidebar row shows a warning icon, a toast tells you the new port, and the forward has an "in use" label. Links to the original port still open your local app, so use the address that the plugin shows.

## Limits

- Forwards are kept in memory. They stop when the local daemon or the plugin restarts. Auto-forward makes them again.
- Throughput fits dev servers and web UIs, not bulk transfer.
- Forwards listen on `127.0.0.1` of the machine that runs the local daemon. The Paseo mobile apps cannot open them.
- TCP only. The remote daemon connects to `127.0.0.1`. A server that listens only on IPv6 (`::1`) is not reachable.
- The port list uses `ss` on Linux and `lsof` on macOS. Windows is not supported.
- Any client that can use a remote daemon can reach that host's local ports through this plugin.
- A Paseo update can break the plugin (see Development).

## Development

`server/remote-hosts.ts` uses internal `@getpaseo/client` APIs, because the plugin SDK cannot call a plugin on another host. Check it after each Paseo update. `npm test` needs Node 22.6 or later.

```bash
npm ci
npm run typecheck
npm test
paseo plugin install "$PWD"
paseo plugin reload port-forward
```
