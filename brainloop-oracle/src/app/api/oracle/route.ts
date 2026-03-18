import { NextResponse } from "next/server";

const oracleResponses: string[] = [
  "The stars whisper of a turning point in your path. What once seemed impossible now bends toward you like light through ancient crystal. Trust the pull you feel, for the cosmos does not deceive those who listen.",
  "I see threads of silver and gold woven through your near future. A door you thought sealed shall crack open, revealing a corridor of immense possibility. Walk through it without hesitation.",
  "The celestial tides shift in your favor, seeker. An old wound begins its final healing, and from that mended place, a new strength shall bloom like midnight flowers under a violet moon.",
  "Beyond the veil, I perceive a great convergence approaching your life. Two paths that seemed forever separate are about to merge into one luminous road. The choice you feared is already made by your deeper self.",
  "The ancient runes carved in starlight speak of patience rewarded. What you have planted in darkness is now reaching toward the light. Soon, very soon, the harvest of your silent labor shall be revealed.",
  "I sense a vibration of change echoing through the chambers of your destiny. Someone from your past carries a message your future self needs to hear. Be open when the unexpected knock arrives.",
  "The cosmic waters run deep around you, seeker. Beneath the surface turmoil lies a profound stillness where your truest answers already reside. Dive inward, and you shall surface with pearls of clarity.",
  "A shadow lifts from the eastern horizon of your fortune. What has obscured your vision was never an obstacle but a cocoon, and you are nearly ready to emerge in radiant new form.",
  "The oracle sees fire in your spirit, a flame that has endured the longest night. This flame is about to catch, spreading warmth and light to corners of your life you had abandoned to cold.",
  "Three moons hence, a revelation awaits you. It will arrive not as thunder but as a whisper in the quiet hour, reshaping your understanding of everything you thought you knew about yourself.",
  "The labyrinth of your current challenge has a hidden center where peace awaits. You are closer to that center than you realize. The walls that seem to block you are merely illusions of old fear.",
  "I read in the cosmic dust a story of reunion. Something lost shall return to you, not in its original form but transformed into exactly what you need now. Recognize it by the warmth it brings.",
  "The great wheel turns, and your season of sowing gives way to reaping. Do not mistake the silence before abundance for emptiness. The universe is merely drawing breath before bestowing its gifts upon you.",
  "Seeker, the oracle perceives a guardian energy surrounding you. Ancient forces have taken notice of your perseverance and are weaving protections into the fabric of your days. You are more watched over than you know.",
  "A crystalline truth forms in the depths of your subconscious. When it surfaces, it will illuminate relationships and choices with startling clarity. Welcome this light, even where it reveals what you did not expect.",
  "The constellation of your ambitions aligns with rare celestial favor. What you dare to envision now carries the weight of destiny behind it. Speak your deepest wish aloud, for the cosmos is listening with particular attention.",
  "I see you standing at the threshold of transformation. The person you are becoming has already started to eclipse the person you were. This metamorphosis cannot be rushed, but neither can it be stopped.",
  "The oracle reads ripples in the pool of time. An act of generosity you performed long ago is circling back to you, magnified by the journey. Prepare to receive what you once freely gave.",
  "Dark silk parts to reveal a tapestry of interconnected moments. What seemed random in your past now reveals its pattern. You have been guided all along by a hand gentler and wiser than chance.",
  "The energy surrounding you crackles with creative potential. A dormant gift stirs within, responding to the cosmic frequencies of this particular moment. Express what rises in you, for it is medicine for more souls than your own.",
  "Seeker, the void between what was and what shall be holds your answer. In stillness, the oracle perceives your question was answered before it was asked. You already know the truth; you seek only permission to believe it.",
  "A bridge of moonlight extends before you, spanning the chasm between doubt and certainty. Each step you have taken in faith has been laying the stones of this crossing. The far shore is closer than the mist suggests.",
  "The oracle senses a deep resonance between your heart and the pulse of the earth itself. You are entering a period of profound alignment where intention and manifestation move as one unified force.",
  "Ancient echoes reveal that your current struggle is the final verse of an old song. When this melody resolves, a new composition begins, one written in a key you have never heard but will instantly recognize as home.",
  "The cosmic mirror reflects back a version of you that stands in full power. This is not a distant future self but who you are beneath the accumulated dust of doubt. Brush it away and claim what has always been yours.",
  "I perceive luminous filaments connecting you to a purpose larger than any single lifetime. The work you do now, especially the work that feels most personal, sends ripples through dimensions you cannot yet perceive.",
  "The oracle sees a garden growing in the ruins of your greatest disappointment. What crumbled made way for richer soil. The seeds you plant here will yield a harvest more nourishing than anything the original structure could have held.",
  "A key forged from starlight turns in a lock you did not know existed. Behind this door lies not an answer but a better question, one that will guide you like a compass needle drawn to true north.",
  "The tides of fortune shift like sand beneath moonlit waves. Your patience has been noted by the ancient watchers, and they decree that what you have awaited shall manifest before the next turning of the cosmic wheel.",
  "Seeker, your aura pulses with the violet light of awakening. The veil between your conscious mind and deeper knowing grows thin. Pay attention to dreams and synchronicities, for they are love letters from your destiny.",
  "The oracle reads the geometry of your soul and finds it beautiful in its complexity. Where you see flaws, the cosmos sees facets that catch and refract light in irreplaceable ways. You are not broken; you are prismatic.",
  "A current of ancestral wisdom flows through you at this very moment. Those who walked before you lend their strength to your steps. You carry forward a legacy of resilience that no single setback can diminish.",
  "The stars arrange themselves into a sigil of protection and promise above your path. Challenges remain, yes, but they are the kind that sculpt rather than destroy. You are being shaped by cosmic hands into something magnificent.",
  "I see golden threads being woven into the tapestry of your tomorrow. Each thread represents a choice made with courage, a word spoken with truth, a moment where you chose love over fear. The pattern nears completion.",
  "The oracle perceives that you stand in the eye of a storm of transformation. All around you, old structures dissolve and reform. In this still center, your clarity is your greatest power. Hold fast to what you know is true.",
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = body.question;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json(
        { error: "The oracle requires a question to divine your answer." },
        { status: 400 }
      );
    }

    if (question.trim().length > 1000) {
      return NextResponse.json(
        { error: "Your question exceeds the limits of mortal speech. Please be more concise." },
        { status: 400 }
      );
    }

    const delay = 1000 + Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const randomIndex = Math.floor(Math.random() * oracleResponses.length);
    const response = oracleResponses[randomIndex];

    return NextResponse.json({
      answer: response,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "The cosmic energies are disturbed. Please try again." },
      { status: 500 }
    );
  }
}
