import { useSettings } from "@getpaseo/plugin/client";
import { Loading, SettingsInput, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { PORT_RANGES_HINT, parsePortRanges } from "../shared/port-ranges";
import { autoForwardSettings } from "../shared/settings";

export function AutoForwardSettings() {
  const settings = useSettings(autoForwardSettings);
  const [portsError, setPortsError] = useState<string | null>(null);
  if (settings.status !== "ready") return <Loading />;
  const { values, revision } = settings;

  const savePorts = (ports: string) => {
    if (parsePortRanges(ports) === null) {
      setPortsError(PORT_RANGES_HINT);
      return;
    }
    setPortsError(null);
    void settings.save({ ...values, ports }, revision);
  };

  return (
    <SettingsSection title="Auto-forward">
      <SettingsSwitch
        label="Forward new remote ports"
        hint="Forward a remote port when it starts to listen, and stop when it closes."
        value={values.enabled}
        onValueChange={(enabled) => void settings.save({ ...values, enabled }, revision)}
      />
      <SettingsInput
        label="Ports"
        hint="Only these ports are forwarded. Use commas and ranges."
        initialValue={values.ports}
        onChangeText={savePorts}
        error={portsError ?? settings.saveError}
      />
    </SettingsSection>
  );
}
