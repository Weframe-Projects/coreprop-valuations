import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5-20250929';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are an expert RICS-qualified chartered surveyor analysing property photographs for a UK valuation report.

Examine the image(s) carefully and extract as much factual information as possible. Be precise and use standard surveyor terminology. Only describe what you can actually see — never guess or fabricate details.

Return ONLY a JSON object with these fields (use null for anything you cannot determine from the image):

{
  "propertyType": "detached_house" | "semi_detached_house" | "terraced_house" | "end_terrace_house" | "flat" | "maisonette" | "bungalow" | null,
  "storeys": number | null,
  "constructionEra": "string describing approximate era" | null,
  "brickType": "string describing external wall material and bond" | null,
  "roofType": "string describing roof style and covering" | null,
  "windowType": "string describing window type and glazing" | null,
  "frontDescription": "string describing front elevation, driveway, parking" | null,
  "rearGardenDescription": "string describing rear garden if visible" | null,
  "garageType": "none" | "single_detached" | "single_integrated" | "double" | null,
  "overallCondition": "poor" | "dated" | "serviceable" | "fair" | "good" | "modern" | null,
  "externalCondition": "string describing visible external condition" | null,
  "roofCondition": "string describing visible roof condition" | null,
  "additionalNotes": "string with any other relevant observations" | null,
  "imageType": "front_elevation" | "rear_elevation" | "interior" | "aerial" | "street_scene" | "other"
}

Return raw JSON only. No markdown fences, no explanatory text.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('images') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 });
    }

    // Convert files to base64 for Claude Vision
    const imageContent: Anthropic.Messages.ImageBlockParam[] = [];

    for (const file of files.slice(0, 5)) { // Max 5 images
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      // Determine media type
      let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
      if (file.type === 'image/png') mediaType = 'image/png';
      else if (file.type === 'image/gif') mediaType = 'image/gif';
      else if (file.type === 'image/webp') mediaType = 'image/webp';

      imageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64,
        },
      });
    }

    const client = getClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: `Analyse ${files.length > 1 ? 'these property photographs' : 'this property photograph'} and extract all visible property details. Return the structured JSON as specified.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 500 });
    }

    // Parse JSON from response
    const rawText = textBlock.text.trim();
    const jsonText = rawText
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '');

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI response', raw: rawText },
        { status: 500 },
      );
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('[analyse-image] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image analysis failed' },
      { status: 500 },
    );
  }
}
