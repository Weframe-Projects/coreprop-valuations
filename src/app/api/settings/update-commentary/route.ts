// Vercel serverless: allow up to 60s for AI commentary generation
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// POST /api/settings/update-commentary
// Uses Claude to generate updated UK residential property market commentary.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prompt = `You are a senior RICS Registered Valuer writing the "Market Commentary" section (Section 17) of a formal residential property valuation report in England.

Write TWO versions of the market commentary for use in RICS-compliant valuation reports. The commentary should cover the current state of the UK residential property market as of today's date.

Both versions should cover:
- Current market conditions and transaction volumes
- Interest rate environment and mortgage market
- Government policy impact (stamp duty, Help to Buy, planning reform etc.)
- Price trends nationally and in the London/South East corridor
- Outlook for the next 6-12 months

VERSION 1 (IHT - without Commercial Property):
Write 4-5 paragraphs covering the residential market. Do NOT include any commercial property commentary.

VERSION 2 (Non-IHT - with Commercial Property):
Write the same residential content as Version 1, PLUS add one additional paragraph at the end covering the commercial property market (office, retail, industrial/logistics).

Important:
- Write in formal third-person professional tone ("The market has..." not "I believe...")
- Reference specific data points where appropriate (average house prices, interest rates, transaction volumes)
- Be balanced and evidence-based, not speculative
- Each paragraph should be 3-5 sentences
- Do not include section headings or bullet points — flowing prose only
- Use UK English spelling throughout

Return your response in this exact format:
---IHT---
[IHT market commentary here]
---NON_IHT---
[Non-IHT market commentary here]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse the two versions
    const ihtMatch = text.match(/---IHT---\s*([\s\S]*?)---NON_IHT---/);
    const nonIhtMatch = text.match(/---NON_IHT---\s*([\s\S]*?)$/);

    if (!ihtMatch || !nonIhtMatch) {
      return NextResponse.json(
        { error: 'Failed to parse AI response into two commentary versions' },
        { status: 500 }
      );
    }

    const ihtCommentary = ihtMatch[1].trim();
    const nonIhtCommentary = nonIhtMatch[1].trim();

    return NextResponse.json({
      market_commentary_iht: ihtCommentary,
      market_commentary_non_iht: nonIhtCommentary,
    });
  } catch (error) {
    console.error('[update-commentary] AI generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate market commentary. Please try again.' },
      { status: 500 }
    );
  }
}
