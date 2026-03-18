// Vercel serverless: allow up to 60s for AI note merging
export const maxDuration = 60;

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ReportRow } from '@/lib/types';

const MODEL = 'claude-sonnet-4-6';

/**
 * Sanitize user-provided text before including in AI prompts.
 * Strips potential prompt injection patterns while preserving legitimate surveyor notes.
 */
function sanitizeForPrompt(text: string): string {
  return text
    .replace(/---\s*(SYSTEM|TASK|INSTRUCTION|OVERRIDE|IGNORE|ADMIN)/gi, '--- [filtered]')
    .replace(/ignore\s+(all\s+)?previous\s+(instructions?|context|rules)/gi, '[filtered]')
    .replace(/you\s+are\s+now\s+/gi, '[filtered]')
    .replace(/```/g, '')
    .trim();
}

// The AI-generated sections that inspection notes can update.
// Template sections (1-4, 16+) are boilerplate and should NOT be modified by notes.
const UPDATABLE_SECTIONS = [
  'section_5_description',
  'section_6_construction',
  'section_7_accommodation',
  'section_8_externally',
  'section_9_services',
  'section_10_floor_area',
  'section_13_condition',
  'section_14_structure',
  'section_15_amenity',
] as const;

const SYSTEM_PROMPT = `You are an expert RICS-qualified chartered surveyor. You are updating an existing property valuation report using the surveyor's on-site inspection notes.

Your task:
1. Read the existing report sections and the new inspection notes
2. Determine which sections the notes are relevant to
3. Rewrite ONLY the sections where the notes add new, useful information
4. Preserve the existing formal surveyor tone and RICS style
5. Weave the surveyor's observations naturally into the text — don't just append them
6. Keep using British English, third person, "the Property" (capitalised)
7. For sections where the notes have no relevance, return the existing text UNCHANGED

Important - understanding surveyor shorthand:
- Measurements like "6.21 x 2.94" are room dimensions in metres (length x width)
- "s/g" = single glazed, "d/g" = double glazed
- "uPVC" / "UPVC" = uPVC (unplasticised polyvinyl chloride) windows
- "FFF" = first floor flat
- "Combi" = combination boiler
- "resi" = residential
- Floor finish shorthand: "carpet", "tiled", "laminate", "wood" after room name means the floor covering
- Condition shorthand: "hairline cracking", "historic water ingress", "dampness", "peeling", "wear and tear"
- "period conversion" = a period building that has been converted into flats/units
- Layout notes and sizing notes should be read TOGETHER — room names from layout correspond to measurements in the same order

Rules:
- Do NOT invent information not in the notes or existing sections
- Do NOT change template/boilerplate sections (instructions, basis, assumptions, etc.)
- Room descriptions from notes should update section_7_accommodation
- Condition observations should update section_13_condition
- External observations should update section_8_externally and section_14_structure
- Area/location notes should update section_5_description and section_15_amenity
- Measurements should update section_10_floor_area if a total floor area is mentioned
- Construction notes (brickwork, roof, stories) should update section_6_construction
- Heating and window notes should update section_9_services
- Return ONLY a JSON object with the section keys and their updated text
- Return ALL updatable section keys, even if unchanged — so the caller knows the full state`;

/**
 * POST /api/reports/[id]/apply-notes
 *
 * Takes the surveyor's structured inspection notes from the inspection_notes table
 * and uses AI to intelligently merge them into the existing report sections.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Load report
  const { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const row = report as ReportRow;
  const sections = row.generated_sections || {};

  // ---- Load structured inspection notes from the inspection_notes table ----
  const { data: inspectionNotesRow } = await supabase
    .from('inspection_notes')
    .select('*')
    .eq('report_id', id)
    .single();

  // Also check legacy location (propertyDetails.inspectionNotes) as fallback
  const propertyDetails = (row.property_details || {}) as Record<string, unknown>;
  const legacyNotes = (propertyDetails.inspectionNotes as string) || '';

  // Build formatted notes string from structured fields
  let inspectionNotes = '';

  if (inspectionNotesRow) {
    const fields = [
      { label: 'Property Description', value: inspectionNotesRow.description_notes },
      { label: 'Construction', value: inspectionNotesRow.construction_notes },
      { label: 'Amenities & Access', value: inspectionNotesRow.amenities_notes },
      { label: 'Room Layout & Floor Finishes', value: inspectionNotesRow.layout_notes },
      { label: 'Room Measurements (metres)', value: inspectionNotesRow.sizing_notes },
      { label: 'Heating', value: inspectionNotesRow.heating_notes },
      { label: 'Windows', value: inspectionNotesRow.windows_notes },
      { label: 'Garden & External', value: inspectionNotesRow.garden_notes },
      { label: 'Condition Observations', value: inspectionNotesRow.condition_notes },
      { label: 'Additional Notes', value: inspectionNotesRow.extra_notes },
    ];

    const filledFields = fields.filter((f) => f.value && f.value.trim());

    if (filledFields.length > 0) {
      const meta = [
        inspectionNotesRow.inspector_initials ? `Inspector: ${inspectionNotesRow.inspector_initials}` : '',
        inspectionNotesRow.inspection_date ? `Date: ${inspectionNotesRow.inspection_date}` : '',
        inspectionNotesRow.time_of_day ? `Time: ${inspectionNotesRow.time_of_day}` : '',
        inspectionNotesRow.weather_conditions ? `Weather: ${inspectionNotesRow.weather_conditions}` : '',
      ].filter(Boolean).join(' | ');

      inspectionNotes = [
        meta,
        '',
        ...filledFields.map((f) => `${f.label}:\n${f.value}`),
      ].join('\n\n');
    }
  }

  // Fall back to legacy notes if structured notes are empty
  if (!inspectionNotes.trim() && legacyNotes.trim()) {
    inspectionNotes = legacyNotes;
  }

  if (!inspectionNotes.trim()) {
    return NextResponse.json(
      { error: 'No inspection notes to apply.' },
      { status: 400 }
    );
  }

  if (Object.keys(sections).length === 0) {
    return NextResponse.json(
      { error: 'Report has no generated sections yet. Please generate the report first.' },
      { status: 400 }
    );
  }

  // Build the prompt with existing sections + notes
  const existingSectionsText = UPDATABLE_SECTIONS.map((key) => {
    const text = sections[key] || '(empty)';
    return `### ${key}\n${text}`;
  }).join('\n\n');

  const userPrompt = `Here is the property at ${row.property_address}, ${row.postcode}.

--- EXISTING REPORT SECTIONS ---

${existingSectionsText}

--- SURVEYOR'S INSPECTION NOTES ---
<inspection_notes>
${sanitizeForPrompt(inspectionNotes)}
</inspection_notes>

--- TASK ---

Update the report sections above by incorporating the surveyor's inspection notes. Return a JSON object with these exact keys: ${UPDATABLE_SECTIONS.map((k) => `"${k}"`).join(', ')}.

Important:
- Room layout notes and room measurements should be READ TOGETHER. The room names in the layout correspond to the measurements listed in the same order. Combine them into proper room descriptions with dimensions.
- Incorporate floor finishes (carpet, tiled, laminate, wood) mentioned alongside room names into the accommodation section.
- Condition issues (cracking, dampness, water ingress) should be specific about which rooms they affect.
- Construction details (brickwork type, roof material, stories) should update construction section.
- Heating and window details should update services section.

For each section, either return the updated text (if notes were relevant to that section) or the existing text unchanged (if notes had nothing to add).

Return ONLY the JSON object, no additional text or markdown.`;

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from AI');
    }

    const rawText = textBlock.text.trim();
    const jsonText = rawText
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '');

    const updatedSections: Record<string, string> = JSON.parse(jsonText);

    // Merge updated sections into existing sections (preserving template sections)
    const mergedSections = { ...sections };
    for (const key of UPDATABLE_SECTIONS) {
      if (updatedSections[key] && typeof updatedSections[key] === 'string') {
        mergedSections[key] = updatedSections[key];
      }
    }

    // Save to database
    await supabase
      .from('reports')
      .update({ generated_sections: mergedSections })
      .eq('id', id)
      .eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      updated_sections: Object.keys(updatedSections),
    });
  } catch (error) {
    console.error('[apply-notes] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to apply notes to report. Please try again.' },
      { status: 500 }
    );
  }
}
