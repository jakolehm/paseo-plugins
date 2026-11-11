Port forward opens ports from your remote Paseo hosts on your own machine. A dev server that listens on `localhost:3000` on a remote host becomes `localhost:3000` on your computer.

## Setup

Install the plugin on your local daemon and on each remote daemon. Add each remote host to the local daemon with `paseo host add <connection>`, for example `paseo host add ssh://user@devbox`.

## Use

Open **Port forwards** in the sidebar. Select a host to see the ports that listen on it, then select **Forward**. You can also type a port number. Active forwards show the local address, the number of open connections, and buttons to open or stop them.

## Auto-forward

Turn on **Settings → Port forward → Forward new remote ports** to forward remote ports when they start to listen, and stop them when they close. Only ports in the **Ports** list are forwarded, for example `3000-3999, 5173`. Auto-forward is off by default.

If a port is already in use on your computer, the plugin uses a free local port and shows a warning. Links to the original port then open your local app, so use the address that the plugin shows.

## How it works

The local daemon listens on `127.0.0.1`. It sends each connection through the Paseo host route to the remote daemon, which connects to `127.0.0.1:<port>` on the remote host. Data goes through the existing Paseo connection, so no extra ports or SSH tunnels are needed.

## Limits

Forwards stay active only while the local daemon runs. Throughput fits dev servers and web UIs, not bulk transfer. Any client that can use the remote daemon can reach that host's local ports through this plugin. On Linux the port list uses `ss`, and on macOS it uses `lsof`.
