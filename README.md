# paseo-plugins

Plugins for [Paseo](https://paseo.sh).

| Plugin | Description |
| --- | --- |
| [port-forward](port-forward) | Open ports from remote Paseo hosts on your own machine. |
| [pr-reviews](pr-reviews) | Run review agents on GitHub PRs and see what waits on you. |

## Install

Install a plugin on each daemon that needs it:

```bash
paseo plugin install github:jakolehm/paseo-plugins:port-forward
paseo plugin install github:jakolehm/paseo-plugins:port-forward --host ssh://user@remote-host
```

Plugins must be enabled on the daemon (`"pluginsEnabled": true` in `~/.paseo/config.json`).
