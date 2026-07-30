import { curatedEnglishLexicon } from "@/lib/lexicon-seeds";
import { createQuestWordBank } from "@/lib/quest-word-bank-data";

export const questWordBank = createQuestWordBank(curatedEnglishLexicon);
