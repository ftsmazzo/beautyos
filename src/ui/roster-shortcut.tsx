"use client";

export function RosterShortcut({ checkName }: { checkName: string }) {
  function formOf(target: HTMLButtonElement) {
    return target.closest("form");
  }

  function pull(target: HTMLButtonElement) {
    const form = formOf(target);
    if (!form) return;
    form.querySelectorAll<HTMLInputElement>(`input[name="${checkName}"]`).forEach((input) => {
      input.checked = true;
      for (const prefix of ["price", "duration", "commission"]) {
        const field = form.querySelector<HTMLInputElement>(`input[name="${prefix}_${input.value}"]`);
        if (field) field.value = "";
      }
    });
  }

  function drop(target: HTMLButtonElement) {
    const form = formOf(target);
    if (!form) return;
    form.querySelectorAll<HTMLInputElement>(`input[name="${checkName}"]`).forEach((input) => {
      input.checked = false;
    });
  }

  return (
    <div className="bos-row">
      <button type="button" className="btn quiet" onClick={(event) => pull(event.currentTarget)}>
        Puxar o padrão
      </button>
      <button type="button" className="btn quiet" onClick={(event) => drop(event.currentTarget)}>
        Tirar todos
      </button>
    </div>
  );
}
