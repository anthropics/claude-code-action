"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  RotateCcw,
  Star,
  Moon,
  Sun,
  Eye,
  Layers,
  Mail,
  Phone,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

/* ─────────────────────── Types ─────────────────────── */

interface TarotCard {
  number: string;
  name: string;
  description: string;
  uprightMeaning: string;
  reversedMeaning: string;
  symbol: string;
}

interface DrawnCard {
  card: TarotCard;
  reversed: boolean;
  position: string;
  flipped: boolean;
}

type SpreadType = "single" | "three" | "celtic";

/* ──────────────────── Major Arcana ──────────────────── */

const MAJOR_ARCANA: TarotCard[] = [
  {
    number: "0",
    name: "The Fool",
    description:
      "A carefree soul stepping into the unknown, carrying nothing but faith and wonder. The Fool represents infinite potential and the courage to begin anew.",
    uprightMeaning:
      "New beginnings, innocence, spontaneity, a free spirit. You stand at the precipice of a great adventure. Trust in the journey and take that leap of faith.",
    reversedMeaning:
      "Recklessness, naivety, risk-taking without thought. You may be acting impulsively or ignoring important warnings. Pause and consider your path before proceeding.",
    symbol: "\u2606",
  },
  {
    number: "I",
    name: "The Magician",
    description:
      "The master of elements stands with one hand reaching skyward and the other pointing to earth, channeling cosmic power into material reality.",
    uprightMeaning:
      "Manifestation, resourcefulness, power, inspired action. You have all the tools you need to create the life you desire. Channel your willpower and make it happen.",
    reversedMeaning:
      "Manipulation, poor planning, untapped talents. Your gifts may be going to waste, or someone around you may not be what they seem. Look beyond the illusion.",
    symbol: "\u221e",
  },
  {
    number: "II",
    name: "The High Priestess",
    description:
      "She sits between the pillars of duality, guardian of the subconscious mind and keeper of hidden knowledge that lies beyond the veil.",
    uprightMeaning:
      "Intuition, sacred knowledge, the subconscious mind. Trust your inner voice \u2014 the answers you seek lie within. Silence and stillness will reveal what logic cannot.",
    reversedMeaning:
      "Secrets, withdrawal, silence taken too far. You may be ignoring your intuition or keeping important truths hidden. Reconnect with your inner wisdom.",
    symbol: "\u263d",
  },
  {
    number: "III",
    name: "The Empress",
    description:
      "Surrounded by golden fields and flowing water, she embodies abundance, nurturing love, and the creative force of nature itself.",
    uprightMeaning:
      "Fertility, abundance, nature, nurturing. A time of growth and creative expression. Embrace beauty, comfort, and the natural flow of abundance into your life.",
    reversedMeaning:
      "Creative block, dependence, emptiness. You may be neglecting self-care or struggling to connect with your creative side. Nurture yourself before nurturing others.",
    symbol: "\u2640",
  },
  {
    number: "IV",
    name: "The Emperor",
    description:
      "Seated upon his stone throne, the Emperor commands with authority and structure. He represents the solid foundation upon which empires are built.",
    uprightMeaning:
      "Authority, structure, a father figure, stability. Establish order and take command of your situation. Discipline and strategic thinking will lead to lasting success.",
    reversedMeaning:
      "Tyranny, rigidity, lack of discipline. Excessive control is stifling growth \u2014 either your own or someone else\u2019s. Flexibility and compassion are needed now.",
    symbol: "\u2642",
  },
  {
    number: "V",
    name: "The Hierophant",
    description:
      "The bridge between heaven and earth, he sits in sacred space dispensing ancient wisdom to those who seek spiritual guidance and tradition.",
    uprightMeaning:
      "Tradition, conformity, spiritual wisdom, education. Seek guidance from established institutions or mentors. There is wisdom in tradition and shared knowledge.",
    reversedMeaning:
      "Rebellion, subversiveness, new approaches. You may need to break free from convention and forge your own spiritual path. Question what you have been taught.",
    symbol: "\u2648",
  },
  {
    number: "VI",
    name: "The Lovers",
    description:
      "Two souls stand beneath a radiant angel, representing the divine union of opposites and the transformative power of choice and commitment.",
    uprightMeaning:
      "Love, harmony, relationships, values alignment. A significant choice approaches, often about relationships or values. Follow your heart while honoring your highest self.",
    reversedMeaning:
      "Disharmony, imbalance, misalignment of values. A relationship or choice is causing inner conflict. Realign with your core values before making commitments.",
    symbol: "\u2665",
  },
  {
    number: "VII",
    name: "The Chariot",
    description:
      "A determined warrior rides forth beneath a canopy of stars, directing opposing forces through sheer will and focused determination.",
    uprightMeaning:
      "Willpower, determination, success, ambition. Victory is within reach through focused determination. Harness opposing forces and charge forward with confidence.",
    reversedMeaning:
      "Lack of control, aggression, no direction. You may feel pulled in too many directions or be forcing outcomes. Release the reins and find your true direction.",
    symbol: "\u2734",
  },
  {
    number: "VIII",
    name: "Strength",
    description:
      "A gentle figure tames a mighty lion not through force but through infinite patience, compassion, and quiet inner power.",
    uprightMeaning:
      "Inner strength, courage, patience, compassion. True power comes from within. Face your challenges with grace and gentle persistence \u2014 you are stronger than you know.",
    reversedMeaning:
      "Self-doubt, weakness, insecurity. You may be struggling with inner demons or losing faith in yourself. Remember your resilience and reconnect with your courage.",
    symbol: "\u2658",
  },
  {
    number: "IX",
    name: "The Hermit",
    description:
      "Atop a mountain peak, the wise one lifts a lantern to illuminate the path, having found truth in solitude and contemplation.",
    uprightMeaning:
      "Soul-searching, introspection, being alone, inner guidance. Withdraw from the noise and seek answers within. Solitude is not loneliness \u2014 it is the path to wisdom.",
    reversedMeaning:
      "Isolation, loneliness, withdrawal. You may be retreating too far from the world or refusing guidance from others. Balance solitude with connection.",
    symbol: "\u2739",
  },
  {
    number: "X",
    name: "Wheel of Fortune",
    description:
      "The great wheel turns eternally, lifting some while lowering others, reminding us that change is the only constant in the cosmos.",
    uprightMeaning:
      "Good luck, karma, life cycles, destiny, a turning point. The wheel is turning in your favor. Embrace change and trust that the universe is aligning opportunities for you.",
    reversedMeaning:
      "Bad luck, resistance to change, breaking cycles. You may feel caught in a negative cycle or resisting inevitable change. Let go and allow the wheel to turn.",
    symbol: "\u2638",
  },
  {
    number: "XI",
    name: "Justice",
    description:
      "With sword raised and scales balanced, Justice sees through all deception, weighing every action against the immutable laws of cause and effect.",
    uprightMeaning:
      "Fairness, truth, cause and effect, law. Truth and accountability are paramount now. Act with integrity, for the scales are weighing your choices carefully.",
    reversedMeaning:
      "Unfairness, lack of accountability, dishonesty. Injustice may be present, or you may be avoiding the consequences of your actions. Face the truth with courage.",
    symbol: "\u2696",
  },
  {
    number: "XII",
    name: "The Hanged Man",
    description:
      "Suspended between worlds, the Hanged Man surrenders to a higher perspective, finding enlightenment through willing sacrifice and patience.",
    uprightMeaning:
      "Pause, surrender, letting go, new perspectives. Sometimes you must stop pushing to find the answer. Surrender control and see the world from a completely new angle.",
    reversedMeaning:
      "Stalling, needless sacrifice, fear of sacrifice. You may be resisting a necessary pause or making martyrdom a habit. Let go of what no longer serves you.",
    symbol: "\u2626",
  },
  {
    number: "XIII",
    name: "Death",
    description:
      "The great transformer rides across the land, not as an end but as the necessary clearing that precedes all profound renewal and rebirth.",
    uprightMeaning:
      "Endings, change, transformation, transition. A chapter is closing, but this is not to be feared. Profound transformation and renewal await on the other side.",
    reversedMeaning:
      "Resistance to change, inability to move on, stagnation. You are clinging to what must be released. Accept the ending so that the new beginning can emerge.",
    symbol: "\u2620",
  },
  {
    number: "XIV",
    name: "Temperance",
    description:
      "An angel stands with one foot on land and one in water, gracefully blending opposing elements into a harmonious golden elixir.",
    uprightMeaning:
      "Balance, moderation, patience, purpose. Find your middle path and blend the disparate elements of your life into harmony. Patience and moderation bring lasting peace.",
    reversedMeaning:
      "Imbalance, excess, lack of long-term vision. You may be overindulging or swinging between extremes. Seek equilibrium and practice patience with yourself.",
    symbol: "\u2625",
  },
  {
    number: "XV",
    name: "The Devil",
    description:
      "Chained figures stand before a dark throne, yet their bonds are loose \u2014 a reminder that the prisons we fear most are often of our own making.",
    uprightMeaning:
      "Shadow self, attachment, addiction, restriction. Examine what chains bind you \u2014 materialism, addiction, toxic patterns. Awareness is the first step toward liberation.",
    reversedMeaning:
      "Releasing limiting beliefs, exploring dark thoughts, detachment. You are breaking free from bondage and reclaiming your power. Continue to shed what enslaves you.",
    symbol: "\u26cb",
  },
  {
    number: "XVI",
    name: "The Tower",
    description:
      "Lightning strikes the crown of a great tower, shattering false structures and illusions to make way for truth and authentic foundations.",
    uprightMeaning:
      "Sudden change, upheaval, chaos, revelation, awakening. The structures you relied upon are crumbling, but this destruction clears the way for something far more authentic.",
    reversedMeaning:
      "Fear of change, avoiding disaster, delaying the inevitable. You may be clinging to a crumbling tower. The fall will be easier if you choose to jump rather than cling.",
    symbol: "\u26a1",
  },
  {
    number: "XVII",
    name: "The Star",
    description:
      "Beneath a sky of brilliant stars, a figure pours healing waters upon the earth, embodying hope, renewal, and divine inspiration.",
    uprightMeaning:
      "Hope, faith, purpose, renewal, spirituality. After the storm comes the star. This is a time of healing, inspiration, and reconnecting with your deepest sense of purpose.",
    reversedMeaning:
      "Lack of faith, despair, disconnection. You may have lost hope or feel disconnected from your purpose. Look up \u2014 the stars are still shining, even behind the clouds.",
    symbol: "\u2605",
  },
  {
    number: "XVIII",
    name: "The Moon",
    description:
      "A luminous moon illuminates a mysterious path between two towers, where shadows dance and nothing is quite as it appears to be.",
    uprightMeaning:
      "Illusion, fear, anxiety, the subconscious, intuition. Things are not as they seem. Navigate carefully through uncertainty and trust your intuition to guide you through the shadows.",
    reversedMeaning:
      "Release of fear, repressed emotions, inner confusion. Hidden truths are coming to light, and old fears are losing their grip. Allow clarity to emerge gradually.",
    symbol: "\u263e",
  },
  {
    number: "XIX",
    name: "The Sun",
    description:
      "A radiant sun blazes in a clear sky, showering warmth, joy, and vitality upon all below \u2014 the purest expression of success and happiness.",
    uprightMeaning:
      "Positivity, fun, warmth, success, vitality. Bask in this radiant energy! Joy, success, and clarity surround you. Celebrate your achievements and share your light with others.",
    reversedMeaning:
      "Inner child issues, feeling down, overly optimistic. The light may feel dimmed, or you may be wearing a mask of happiness. Find authentic joy rather than performing it.",
    symbol: "\u2609",
  },
  {
    number: "XX",
    name: "Judgement",
    description:
      "A great trumpet sounds from the heavens as souls rise to answer the call, embracing their higher purpose and ultimate transformation.",
    uprightMeaning:
      "Judgement, rebirth, inner calling, absolution. You are being called to rise to your higher purpose. Reflect on your past, forgive yourself, and answer the call of your destiny.",
    reversedMeaning:
      "Self-doubt, inner critic, ignoring the call. You may be avoiding a crucial self-evaluation or refusing to heed your inner calling. Silence the critic and listen to your soul.",
    symbol: "\u2721",
  },
  {
    number: "XXI",
    name: "The World",
    description:
      "A dancer floats within a laurel wreath, celebrating the completion of a great cycle and the unity of all elements in perfect harmony.",
    uprightMeaning:
      "Completion, integration, accomplishment, travel. A magnificent cycle reaches its conclusion. Celebrate your journey, embrace wholeness, and prepare for the next great adventure.",
    reversedMeaning:
      "Lack of completion, lack of closure, stagnation. A chapter remains unfinished, or you feel stuck short of the finish line. Identify what needs closure and complete the cycle.",
    symbol: "\u2641",
  },
];

/* ──────────────────── Spread Configs ──────────────────── */

const SPREAD_CONFIGS: Record<
  SpreadType,
  { name: string; count: number; positions: string[]; icon: React.ReactNode }
> = {
  single: {
    name: "Single Card",
    count: 1,
    positions: ["Your Message"],
    icon: <Eye className="w-5 h-5" />,
  },
  three: {
    name: "Three Card Spread",
    count: 3,
    positions: ["Past", "Present", "Future"],
    icon: <Layers className="w-5 h-5" />,
  },
  celtic: {
    name: "Celtic Cross",
    count: 5,
    positions: [
      "Present Situation",
      "The Challenge",
      "The Foundation",
      "The Near Future",
      "The Outcome",
    ],
    icon: <Star className="w-5 h-5" />,
  },
};

/* ──────────────── Reading Templates ──────────────── */

const READING_INTROS = [
  "The veil between worlds thins as the cards reveal their wisdom. Here is what the universe whispers to you:",
  "The cosmic energies align to bring you this message. Listen closely, for the cards speak truths that resonate with your soul:",
  "Through the mists of time and space, the arcana have chosen to reveal themselves. Their message carries great significance:",
  "The ancient symbols dance with meaning as your reading unfolds. The universe has carefully selected these cards for you:",
  "A sacred pattern emerges from the cosmic tapestry. The cards before you hold a deeply personal message:",
  "The stars align and the cards respond to the energy of your question. What they reveal is both timely and transformative:",
  "From the depths of the collective unconscious, these archetypes rise to meet you. Their wisdom is ancient yet ever-relevant:",
];

const SINGLE_TEMPLATES = [
  (c: DrawnCard) =>
    `${c.card.name} appears ${c.reversed ? "reversed" : "upright"} as your guiding message. ${c.reversed ? c.card.reversedMeaning : c.card.uprightMeaning} This card arrives at this moment as a mirror reflecting your current spiritual journey. Meditate on its imagery and allow its symbolism to unlock deeper understanding within you. The universe does not speak without reason \u2014 this card was drawn for you, right now, for a purpose that may reveal itself in the coming days.`,
  (c: DrawnCard) =>
    `The energy of ${c.card.name} ${c.reversed ? "(reversed) " : ""}radiates through your reading today. ${c.reversed ? c.card.reversedMeaning : c.card.uprightMeaning} This is not mere coincidence \u2014 the card has found you at a crossroads. Consider what aspects of ${c.card.name} resonate most deeply with your current circumstances. The answers you seek are already within; this card simply illuminates the path forward.`,
  (c: DrawnCard) =>
    `${c.card.name} emerges from the deck ${c.reversed ? "in its reversed aspect" : "standing tall and clear"}, carrying a potent message. ${c.reversed ? c.card.reversedMeaning : c.card.uprightMeaning} As card ${c.card.number} of the Major Arcana, it represents a significant archetypal force at work in your life. Pay attention to synchronicities related to this card\u2019s themes in the coming week.`,
];

const THREE_CARD_TEMPLATES = [
  (cards: DrawnCard[]) =>
    `Your journey through time reveals a powerful narrative. In the Past position, ${cards[0].card.name} ${cards[0].reversed ? "(reversed) " : ""}shows that ${cards[0].reversed ? cards[0].card.reversedMeaning.toLowerCase() : cards[0].card.uprightMeaning.toLowerCase()} This energy has shaped the foundation of your current reality.\n\nThe Present brings ${cards[1].card.name} ${cards[1].reversed ? "(reversed)" : ""}, indicating that ${cards[1].reversed ? cards[1].card.reversedMeaning.toLowerCase() : cards[1].card.uprightMeaning.toLowerCase()} This is the energy you are actively navigating right now.\n\nLooking to the Future, ${cards[2].card.name} ${cards[2].reversed ? "(reversed) " : ""}suggests that ${cards[2].reversed ? cards[2].card.reversedMeaning.toLowerCase() : cards[2].card.uprightMeaning.toLowerCase()} Together, these three cards weave a story of transformation \u2014 honor the past, embrace the present, and step confidently toward what awaits.`,
  (cards: DrawnCard[]) =>
    `The threads of fate reveal themselves through these three sacred cards. ${cards[0].card.name} ${cards[0].reversed ? "(reversed) " : ""}in your Past speaks of energies that have been shaping your path: ${cards[0].reversed ? cards[0].card.reversedMeaning.toLowerCase() : cards[0].card.uprightMeaning.toLowerCase()}\n\nAt the center of your reading, ${cards[1].card.name} ${cards[1].reversed ? "(reversed) " : ""}illuminates your Present moment. ${cards[1].reversed ? cards[1].card.reversedMeaning : cards[1].card.uprightMeaning}\n\nThe Future card, ${cards[2].card.name} ${cards[2].reversed ? "(reversed)" : ""}, promises a shift ahead: ${cards[2].reversed ? cards[2].card.reversedMeaning.toLowerCase() : cards[2].card.uprightMeaning.toLowerCase()} The progression from ${cards[0].card.name} through ${cards[1].card.name} to ${cards[2].card.name} suggests a profound evolution unfolding in your life.`,
  (cards: DrawnCard[]) =>
    `Past, present, and future converge in this powerful reading. The echoes of ${cards[0].card.name} ${cards[0].reversed ? "(reversed) " : ""}still reverberate through your life. ${cards[0].reversed ? cards[0].card.reversedMeaning : cards[0].card.uprightMeaning}\n\nRight now, the energy of ${cards[1].card.name} ${cards[1].reversed ? "(reversed) " : ""}surrounds you. ${cards[1].reversed ? cards[1].card.reversedMeaning : cards[1].card.uprightMeaning}\n\nAhead lies the promise of ${cards[2].card.name} ${cards[2].reversed ? "(reversed)" : ""}. ${cards[2].reversed ? cards[2].card.reversedMeaning : cards[2].card.uprightMeaning} The arc from past to future is clear \u2014 each card builds upon the last, creating a roadmap for your spiritual journey.`,
];

const CELTIC_TEMPLATES = [
  (cards: DrawnCard[]) =>
    `This Celtic Cross reading unveils the deeper forces at play in your life.\n\n**Present Situation**: ${cards[0].card.name} ${cards[0].reversed ? "(reversed) " : ""}sits at the heart of your reading. ${cards[0].reversed ? cards[0].card.reversedMeaning : cards[0].card.uprightMeaning}\n\n**The Challenge**: Crossing your path, ${cards[1].card.name} ${cards[1].reversed ? "(reversed) " : ""}represents the obstacle or influence you must navigate. ${cards[1].reversed ? cards[1].card.reversedMeaning : cards[1].card.uprightMeaning}\n\n**The Foundation**: ${cards[2].card.name} ${cards[2].reversed ? "(reversed) " : ""}forms the bedrock of this situation. ${cards[2].reversed ? cards[2].card.reversedMeaning : cards[2].card.uprightMeaning}\n\n**Near Future**: ${cards[3].card.name} ${cards[3].reversed ? "(reversed) " : ""}reveals what is approaching. ${cards[3].reversed ? cards[3].card.reversedMeaning : cards[3].card.uprightMeaning}\n\n**The Outcome**: ${cards[4].card.name} ${cards[4].reversed ? "(reversed) " : ""}crowns your reading with the ultimate direction of these combined energies. ${cards[4].reversed ? cards[4].card.reversedMeaning : cards[4].card.uprightMeaning}\n\nThe interplay between ${cards[0].card.name} and ${cards[1].card.name} at the center of this spread suggests a dynamic tension that, when resolved, will lead toward the outcome promised by ${cards[4].card.name}. Trust the process and remain open to the lessons each card brings.`,
  (cards: DrawnCard[]) =>
    `The Celtic Cross opens a window into the multi-layered forces shaping your reality.\n\nAt the center, ${cards[0].card.name} ${cards[0].reversed ? "(reversed) " : ""}reveals your current state: ${cards[0].reversed ? cards[0].card.reversedMeaning.toLowerCase() : cards[0].card.uprightMeaning.toLowerCase()}\n\nThe challenge of ${cards[1].card.name} ${cards[1].reversed ? "(reversed) " : ""}crosses this energy, creating friction that demands attention: ${cards[1].reversed ? cards[1].card.reversedMeaning.toLowerCase() : cards[1].card.uprightMeaning.toLowerCase()}\n\nBeneath everything lies ${cards[2].card.name} ${cards[2].reversed ? "(reversed)" : ""}, the deep foundation: ${cards[2].reversed ? cards[2].card.reversedMeaning.toLowerCase() : cards[2].card.uprightMeaning.toLowerCase()}\n\nThe near future brings the energy of ${cards[3].card.name} ${cards[3].reversed ? "(reversed)" : ""}: ${cards[3].reversed ? cards[3].card.reversedMeaning.toLowerCase() : cards[3].card.uprightMeaning.toLowerCase()}\n\nFinally, ${cards[4].card.name} ${cards[4].reversed ? "(reversed) " : ""}as the Outcome reveals where all these forces converge: ${cards[4].reversed ? cards[4].card.reversedMeaning.toLowerCase() : cards[4].card.uprightMeaning.toLowerCase()}\n\nThis reading speaks of a journey from the known (${cards[2].card.name}) through challenge (${cards[1].card.name}) toward a meaningful resolution (${cards[4].card.name}). Embrace each stage with awareness and courage.`,
];

function generateReading(cards: DrawnCard[], spread: SpreadType): string {
  const intro = READING_INTROS[Math.floor(Math.random() * READING_INTROS.length)];
  let body: string;

  if (spread === "single") {
    const template =
      SINGLE_TEMPLATES[Math.floor(Math.random() * SINGLE_TEMPLATES.length)];
    body = template(cards[0]);
  } else if (spread === "three") {
    const template =
      THREE_CARD_TEMPLATES[
        Math.floor(Math.random() * THREE_CARD_TEMPLATES.length)
      ];
    body = template(cards);
  } else {
    const template =
      CELTIC_TEMPLATES[Math.floor(Math.random() * CELTIC_TEMPLATES.length)];
    body = template(cards);
  }

  return `${intro}\n\n${body}`;
}

/* ──────────────────── Star Field ──────────────────── */

function StarField() {
  const stars = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: `${(i * 17 + 7) % 100}%`,
      top: `${(i * 23 + 13) % 100}%`,
      size: (i % 3) + 1,
      duration: `${3 + (i % 4)}s`,
      delay: `${(i % 5) * 0.6}s`,
    }));
  }, []);

  return (
    <div className="star-field">
      {stars.map((star) => (
        <div
          key={star.id}
          className="star"
          style={{
            left: star.left,
            top: star.top,
            width: `${star.size}px`,
            height: `${star.size}px`,
            ["--duration" as string]: star.duration,
            ["--delay" as string]: star.delay,
          }}
        />
      ))}
    </div>
  );
}

/* ──────────────────── Card Component ──────────────────── */

function TarotCardDisplay({
  drawnCard,
  index,
  onFlip,
}: {
  drawnCard: DrawnCard;
  index: number;
  onFlip: (index: number) => void;
}) {
  const { card, reversed, position, flipped } = drawnCard;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.2, duration: 0.6, ease: "easeOut" }}
      className="flex flex-col items-center gap-3"
    >
      <span className="text-mystic-gold font-semibold text-sm uppercase tracking-widest">
        {position}
      </span>

      <div
        className="card-flip-container w-48 h-72 sm:w-56 sm:h-80 cursor-pointer"
        onClick={() => onFlip(index)}
      >
        <div className={`card-flip-inner ${flipped ? "flipped" : ""}`}>
          {/* Card Back */}
          <div className="card-flip-front card-back-pattern border-2 border-mystic-violet/40 flex items-center justify-center mystical-glow">
            <div className="text-center">
              <div className="text-4xl mb-2 opacity-60">{"\u2726"}</div>
              <p className="text-mystic-accent/60 text-xs uppercase tracking-widest">
                Tap to Reveal
              </p>
            </div>
          </div>

          {/* Card Face */}
          <div
            className={`card-flip-back border-2 border-mystic-gold/40 gold-glow bg-gradient-to-b from-mystic-card via-mystic-surface to-mystic-card flex flex-col items-center justify-between p-4 ${
              reversed ? "card-reversed" : ""
            }`}
          >
            <div className="text-mystic-gold/60 text-xs font-semibold tracking-widest uppercase">
              {card.number}
            </div>
            <div className="text-center flex-1 flex flex-col items-center justify-center gap-2">
              <div className="text-5xl">{card.symbol}</div>
              <h3 className="text-mystic-gold-light font-bold text-base leading-tight">
                {card.name}
              </h3>
              {reversed && (
                <span className="text-red-400/80 text-xs font-medium uppercase tracking-wider">
                  Reversed
                </span>
              )}
            </div>
            <div className="text-mystic-accent/50 text-[10px] text-center leading-relaxed line-clamp-3">
              {card.description}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ──────────────────── Main Page ──────────────────── */

export default function TarotApp() {
  const [spreadType, setSpreadType] = useState<SpreadType>("three");
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [reading, setReading] = useState<string>("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [allFlipped, setAllFlipped] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const drawCards = useCallback(() => {
    setIsDrawing(true);
    setReading("");
    setAllFlipped(false);

    const config = SPREAD_CONFIGS[spreadType];
    const shuffled = [...MAJOR_ARCANA].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, config.count);

    const drawn: DrawnCard[] = selected.map((card, i) => ({
      card,
      reversed: Math.random() < 0.3,
      position: config.positions[i],
      flipped: false,
    }));

    setTimeout(() => {
      setDrawnCards(drawn);
      setIsDrawing(false);
      toast.success("The cards have been drawn. Tap each card to reveal it.");
    }, 600);
  }, [spreadType]);

  const flipCard = useCallback(
    (index: number) => {
      setDrawnCards((prev) => {
        const updated = [...prev];
        if (updated[index].flipped) return prev;
        updated[index] = { ...updated[index], flipped: true };

        const allNowFlipped = updated.every((c) => c.flipped);
        if (allNowFlipped && !allFlipped) {
          setAllFlipped(true);
          setTimeout(() => {
            const readingText = generateReading(updated, spreadType);
            setReading(readingText);
          }, 800);
        }

        return updated;
      });
    },
    [allFlipped, spreadType]
  );

  const resetReading = useCallback(() => {
    setDrawnCards([]);
    setReading("");
    setAllFlipped(false);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-mystic-bg relative overflow-x-hidden">
      <StarField />

      <div className="relative z-10">
        {/* Header */}
        <header className="pt-8 pb-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <Moon className="w-6 h-6 text-mystic-accent" />
              <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-mystic-violet via-mystic-gold-light to-mystic-purple bg-clip-text text-transparent">
                BrainLoop Tarot
              </h1>
              <Sun className="w-6 h-6 text-mystic-gold" />
            </div>
            <p className="text-mystic-accent/60 text-sm tracking-widest uppercase">
              Discover the Wisdom of the Major Arcana
            </p>
          </motion.div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 pb-12">
          {/* Spread Selection */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-wrap justify-center gap-3 mb-8"
          >
            {(Object.keys(SPREAD_CONFIGS) as SpreadType[]).map((type) => {
              const config = SPREAD_CONFIGS[type];
              return (
                <button
                  key={type}
                  onClick={() => {
                    setSpreadType(type);
                    resetReading();
                  }}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
                    spreadType === type
                      ? "bg-mystic-violet/30 border-2 border-mystic-violet text-mystic-gold-light shadow-lg shadow-mystic-violet/20"
                      : "bg-mystic-surface/60 border-2 border-mystic-violet/20 text-mystic-accent/70 hover:border-mystic-violet/40 hover:bg-mystic-surface"
                  }`}
                >
                  {config.icon}
                  {config.name}
                  <span className="text-xs opacity-60">
                    ({config.count} {config.count === 1 ? "card" : "cards"})
                  </span>
                </button>
              );
            })}
          </motion.div>

          {/* Draw Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="text-center mb-10"
          >
            <button
              onClick={drawCards}
              disabled={isDrawing}
              className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-mystic-violet to-mystic-purple rounded-2xl font-bold text-white text-lg transition-all duration-300 hover:shadow-xl hover:shadow-mystic-violet/30 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-5 h-5 group-hover:animate-spin" />
              {isDrawing ? "Drawing the Cards..." : "Draw Your Cards"}
              <Sparkles className="w-5 h-5 group-hover:animate-spin" />
            </button>

            {drawnCards.length > 0 && (
              <button
                onClick={resetReading}
                className="ml-4 inline-flex items-center gap-2 px-5 py-4 bg-mystic-surface border-2 border-mystic-violet/30 rounded-2xl font-medium text-mystic-accent/70 transition-all duration-300 hover:border-mystic-violet/50 hover:text-mystic-accent"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            )}
          </motion.div>

          {/* Drawn Cards */}
          <AnimatePresence mode="wait">
            {drawnCards.length > 0 && (
              <motion.div
                key="cards"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap justify-center gap-6 sm:gap-8 mb-10"
              >
                {drawnCards.map((dc, i) => (
                  <TarotCardDisplay
                    key={`${dc.card.number}-${i}`}
                    drawnCard={dc}
                    index={i}
                    onFlip={flipCard}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Card Details (after flip) */}
          <AnimatePresence>
            {allFlipped && drawnCards.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="max-w-4xl mx-auto mb-10"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {drawnCards.map((dc, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className="gradient-border p-5"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{dc.card.symbol}</span>
                        <div>
                          <h3 className="text-mystic-gold-light font-bold text-sm">
                            {dc.card.name}
                            {dc.reversed && (
                              <span className="text-red-400/80 ml-1 text-xs">
                                (Reversed)
                              </span>
                            )}
                          </h3>
                          <p className="text-mystic-accent/50 text-xs">
                            {dc.position}
                          </p>
                        </div>
                      </div>
                      <p className="text-mystic-accent/70 text-xs leading-relaxed">
                        {dc.reversed
                          ? dc.card.reversedMeaning
                          : dc.card.uprightMeaning}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI Reading */}
          <AnimatePresence>
            {reading && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="max-w-3xl mx-auto"
              >
                <div className="gradient-border p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-5">
                    <Sparkles className="w-5 h-5 text-mystic-gold" />
                    <h2 className="text-xl font-bold text-mystic-gold-light">
                      Your Reading
                    </h2>
                    <Sparkles className="w-5 h-5 text-mystic-gold" />
                  </div>
                  <div className="text-mystic-accent/80 leading-relaxed whitespace-pre-line text-sm sm:text-base">
                    {reading}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-mystic-violet/20 bg-mystic-surface/50 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                  <Building2 className="w-4 h-4 text-mystic-accent/50" />
                  <span className="text-mystic-accent/70 text-sm font-semibold">
                    NorwegianSpark SA
                  </span>
                </div>
                <p className="text-mystic-accent/40 text-xs">
                  Org. 834 984 172
                </p>
              </div>

              <div className="flex flex-col items-center gap-1 text-xs text-mystic-accent/50">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5" />
                  <a
                    href="mailto:norwegianspark@gmail.com"
                    className="hover:text-mystic-accent transition-colors"
                  >
                    norwegianspark@gmail.com
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" />
                  <a
                    href="tel:+4799737467"
                    className="hover:text-mystic-accent transition-colors"
                  >
                    +47 99 73 74 67
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-mystic-accent/50">
                <Link
                  href="/privacy"
                  className="hover:text-mystic-accent transition-colors"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/terms"
                  className="hover:text-mystic-accent transition-colors"
                >
                  Terms of Service
                </Link>
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-mystic-accent/30">
              &copy; {new Date().getFullYear()} NorwegianSpark SA. All rights
              reserved. For entertainment purposes only.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
