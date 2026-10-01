import { WEEKDAYS } from "@/catalog/labels";

export function HoursGrid({
  prefix,
  values,
}: {
  prefix: string;
  values: Record<string, { start: string; end: string }>;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Dia</th>
          <th>Primeiro período</th>
          <th>Segundo período</th>
        </tr>
      </thead>
      <tbody>
        {WEEKDAYS.map((label, day) => (
          <tr key={`${prefix}-${day}`}>
            <td>{label}</td>
            {[1, 2].map((period) => {
              const slot = values[`${day}-${period}`];
              return (
                <td key={period}>
                  <div className="row">
                    <input type="time" name={`${prefix}_${day}_${period}_start`} defaultValue={slot?.start ?? ""} />
                    <input type="time" name={`${prefix}_${day}_${period}_end`} defaultValue={slot?.end ?? ""} />
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
