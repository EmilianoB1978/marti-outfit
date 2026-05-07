// Quick actions cross-feature dal modal capo: crea velocemente
// promemoria pre-compilati o note linkate al capo.
//
// Tipi azioni:
//   rem-wash    -> reminder lavaggio (oggi sera)
//   rem-tailor  -> reminder sarta (tra 7gg)
//   rem-retry   -> reminder 'riprova' (tra 1gg)
//   note-tailor -> apri editor nota tipo 'tailor' pre-compilata

import { createReminder } from "./reminders-data.js";
import { createNote } from "./notes-data.js";

function nameOf(item) {
  return item.subcategory || item.category || "capo";
}

function todayEvening() {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  return d;
}

function inDays(days, hour = 17) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export async function handleItemQuickAction(action, item) {
  if (!item) throw new Error("nessun capo selezionato");
  const name = nameOf(item);

  switch (action) {
    case "rem-wash":
      await createReminder({
        type: "wash",
        title: `Lava ${name}`,
        dueAt: todayEvening(),
        priority: "medium",
        garmentId: item.id,
      });
      return { kind: "reminder", message: "🧺 Promemoria lavaggio creato per stasera" };

    case "rem-tailor":
      await createReminder({
        type: "tailor",
        title: `Porta da sarta: ${name}`,
        dueAt: inDays(7),
        priority: "high",
        garmentId: item.id,
      });
      return { kind: "reminder", message: "✂️ Promemoria sarta creato (tra 7gg)" };

    case "rem-retry":
      await createReminder({
        type: "garment",
        title: `Riprova ${name}`,
        dueAt: inDays(1),
        priority: "low",
        garmentId: item.id,
      });
      return { kind: "reminder", message: "🔄 Ti ricorderemo di riprovarlo domani" };

    case "note-tailor": {
      const noteId = await createNoteAndReturnId({
        type: "tailor",
        title: `Modifica per ${name}`,
        body: "",
        tags: ["sarta"],
        data: { garment_id: item.id, garment_name: name },
      });
      // Naviga al detail della nota
      location.href = `./note-detail.html?id=${noteId}`;
      return { kind: "navigate" };
    }

    default:
      throw new Error("azione sconosciuta: " + action);
  }
}

async function createNoteAndReturnId(payload) {
  const note = await createNote(payload);
  return note.id;
}
