// ============================================================
// CoreProp Valuation Report - Boilerplate Text Templates
// ============================================================

import type { ReportType, UserSettings } from '@/lib/types';
import { isIHTType, isInspectedType, isAuctionType } from '@/lib/types';

// --- Template Interface ---

export interface ReportTemplate {
  instructions: string;
  basisOfValuation: string;
  assumptionsAndSources: string;
  inspection: string;
  // sections 5-15 are AI-generated, not templated
  comparableDataIntro: string;
  marketCommentary: string;
  valuationConclusion: string;
  auctionReserveSection: string | null; // null for non-auction types
  signatureBlock: string;
  appendix1: string;
}

// --- Placeholder Replacement Utility ---

/**
 * Replaces all {{VARIABLE}} placeholders in a template string with their
 * corresponding values from the provided variables record.
 *
 * Unmatched placeholders are left in place so they can be identified as
 * still needing data.
 */
export function fillTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => {
    return key in variables ? variables[key] : match;
  });
}

// ============================================================
// Section Text Builders
// ============================================================

// --- Section 1: Instructions ---

function getInstructions(reportType: ReportType): string {
  switch (reportType) {
    case 'iht_inspected':
    case 'iht_desktop':
      return [
        '1.1. The CoreProp Group have been instructed on behalf of the Executors of the Estate of the late {{DECEASED_NAME}} c/o {{CLIENT_NAME}}.',
        '',
        '1.2. Our instructions are to prepare Retrospective Valuation advice on the Property, which forms part of the Estate of the deceased.',
        '',
        '1.3. Our instructions are that the Valuation should be as at the date of death, {{DATE_OF_DEATH}}.',
      ].join('\n');

    case 'current_market_inspected':
    case 'current_market_desktop':
      return [
        '1.1. The CoreProp Group has been instructed by {{CLIENT_NAME}}.',
        '',
        '1.2. Our instructions are to prepare Market Valuation advice on the Property.',
        '',
        '1.3. Our instructions are that the Valuation should be as at, {{VALUATION_DATE}}.',
      ].join('\n');

    case 'auction_inspected':
    case 'auction_desktop':
      return [
        '1.1. The CoreProp Group has been instructed by {{CLIENT_NAME}}.',
        '',
        '1.2. Our instructions are to prepare Market Valuation advice on the Property.',
        '',
        '1.3. Our instructions are that the Valuation should be as at, {{VALUATION_DATE}}.',
        '',
        '1.3. We have been instructed by {{AUCTION_COMPANY}}.',
      ].join('\n');

    case 'ha_current_market_auction':
      return [
        '1.1. The CoreProp Group have been instructed to prepare Market Valuation advice on the Property.',
        '',
        '1.2. Our instructions are that the Valuation should be as at, {{VALUATION_DATE}}.',
        '',
        '1.3. We have been instructed by {{AUCTION_COMPANY}}.',
      ].join('\n');

    case 'aso_inspected':
    case 'aso_desktop':
      return [
        '1.1. The CoreProp Group has been instructed by {{CLIENT_NAME}}.',
        '',
        '1.2. Our instructions are to prepare a Shared Ownership Market Valuation advice on the Property.',
        '',
        '1.3. Our instructions are that the Valuation should be as at, {{VALUATION_DATE}}.',
      ].join('\n');

    case 'portfolio_inspected':
    case 'portfolio_desktop':
      return [
        '1.1. The CoreProp Group has been instructed by {{CLIENT_NAME}}.',
        '',
        '1.2. Our instructions are to prepare Market Valuation advice on the Property as part of a portfolio valuation.',
        '',
        '1.3. Our instructions are that the Valuation should be as at, {{VALUATION_DATE}}.',
      ].join('\n');
  }
}

// --- Section 2: Basis of Valuation ---

function getBasisOfValuation(reportType: ReportType): string {
  switch (reportType) {
    case 'iht_inspected':
    case 'iht_desktop':
      return [
        '2.1. We have valued the property using the basis of Market Value as defined in the Appraisal and Valuation Standards of the Royal Institution of Chartered Surveyors.',
        '',
        '2.2. Market Value - In this instance is as defined in Section 160 of The Inheritance Act 1984 (section 272, Taxation of Chargeable Gains Act 1992). The purpose of the valuation is to provide you with a Retrospective Market Valuation for IHT purposes (as defined in IVS 104 (30.1) of the RICS International Valuation Standards).',
        '',
        '2.3. The report will comply with the RICS Red Book (UK Edition) standards and will be conducted and signed off by an RICS Registered Valuer.',
        '',
        '2.4. General Definition of Market Value - The estimated amount for which an asset or liability should exchange on the valuation date between a willing buyer and a willing seller in an arm\'s length transaction, after proper marketing and where the parties had each acted knowledgeably, prudently and without compulsion.',
        '',
        '2.5. S.160 IHTA 1984 further defines Market Value for IHT as follows:- \'The value at any time of any property shall for the purposes of this Act be the price which the property might reasonably be expected to fetch if sold in the open market at that time; but that price shall not be assumed to be reduced on the ground that the whole property is to be placed on the market at one and the same time. The principle of prudent lotting (see Practice Note 1: paras 3.1 - 3.4) applies where an estate consists of items of property which properly may be treated as separate units in order that the best price can be obtained. Lotting is essentially a matter of judgement. Artificial and unnatural lots should generally be avoided, however, reference should be made to the judgement of Hoffman LJ in the case of IRC v Gray (Executor of Lady Fox deceased (1994) (see Practice Note 1 Appendix F) with regard to the natural unit. There may well be circumstances where a sale of the whole estate, as a single lot, would achieve a better price than if it were sold as separate units.\'',
        '',
        '2.6. In arriving at Market Value, the following assumptions must be made: - The sale is a hypothetical sale; The vendor is a hypothetical, prudent and willing party to the transaction; The purchaser is a hypothetical, prudent and willing party to the transaction (unless considered a "special purchaser").',
      ].join('\n');

    case 'current_market_inspected':
    case 'current_market_desktop':
      return [
        '2.1. We have valued the property using the basis of Market Value as defined in the Appraisal and Valuation Standards of the Royal Institution of Chartered Surveyors.',
        '',
        '2.2. Market Value - The purpose of the valuation is to provide you with Open Market Valuation advice as defined by the RICS International Valuation Standards. The report will comply with the RICS Red Book (UK Edition) standards and will be conducted and signed off by an RICS Registered Valuer.',
        '',
        '2.3. Definition of Market Value - The estimated amount for which an asset or liability should exchange on the valuation date between a willing buyer and a willing seller in an arm\'s length transaction, after proper marketing and where the parties had each acted knowledgeably, prudently and without compulsion.',
        '',
        '2.4. In arriving at Market Value, the following assumptions must be made:- The sale is a hypothetical sale; The vendor is a hypothetical, prudent and willing party to the transaction; The purchaser is a hypothetical, prudent and willing party to the transaction (unless considered a "special purchaser").',
      ].join('\n');

    case 'auction_inspected':
    case 'auction_desktop':
    case 'ha_current_market_auction':
      return [
        '2.1. We have valued the property using the basis of market value as defined in the Appraisal and Valuation Standards of the Royal Institution of Chartered Surveyors from which we provide the following extract to assist:',
        '',
        '2.2. Market Value - Definitions of the basis of value can be found in section 272, Taxation of Chargeable Gains Act 1992. The purpose of the valuation is to provide you with Open Market Valuation advice as defined by the RICS International Valuation Standards. The report will comply with the RICS Red Book (UK Edition) standards and will be conducted and signed off by an RICS Registered Valuer.',
        '',
        '2.3. Definition of Market Value - \'The price which the property might reasonably be expected to fetch if sold in the open market at that time, but that price must not be assumed to be reduced on the grounds that the whole property is to be placed on the market at one and the same time.\' The Red Book at UK VPGA 15 deals solely with the statutory basis of market value for Capital Gains Tax (CGT) (including corporation tax on capital gains), Inheritance Tax (IHT), Stamp Duty Land Tax (SDLT), Land and Buildings Transaction Tax in Scotland, Land Transactions Tax (LTT) in Wales and Annual Tax on Enveloped UK VPGA 15 Valuations for CGT, Inheritance Tax, Stamp Duty Land Tax and the Annual Tax on Enveloped Dwellings UK Valuation Practice Guidance Applications (UK VPGAs) Dwellings (ATED), and does not cover valuations that may be required for income tax or corporation tax (such as capital allowances).',
        '',
        'In arriving at Market Value, the following assumptions must be made:- The sale is a hypothetical sale; The vendor is a hypothetical, prudent and willing party to the transaction; The purchaser is a hypothetical, prudent and willing party to the transaction (unless considered a "special purchaser").',
      ].join('\n');

    case 'aso_inspected':
    case 'aso_desktop':
    case 'portfolio_inspected':
    case 'portfolio_desktop':
      return [
        '2.1. We have valued the property using the basis of Market Value as defined in the Appraisal and Valuation Standards of the Royal Institution of Chartered Surveyors.',
        '',
        '2.2. Market Value - The purpose of the valuation is to provide you with Open Market Valuation advice as defined by the RICS International Valuation Standards. The report will comply with the RICS Red Book (UK Edition) standards and will be conducted and signed off by an RICS Registered Valuer.',
        '',
        '2.3. Definition of Market Value - The estimated amount for which an asset or liability should exchange on the valuation date between a willing buyer and a willing seller in an arm\'s length transaction, after proper marketing and where the parties had each acted knowledgeably, prudently and without compulsion.',
        '',
        '2.4. In arriving at Market Value, the following assumptions must be made:- The sale is a hypothetical sale; The vendor is a hypothetical, prudent and willing party to the transaction; The purchaser is a hypothetical, prudent and willing party to the transaction (unless considered a "special purchaser").',
      ].join('\n');
  }
}

// --- Section 3: Assumptions and Sources of Information ---

function getAssumptionsAndSources(reportType: ReportType, options?: { hasTitleNumber?: boolean }): string {
  const isInspected = isInspectedType(reportType);
  const hasTitleNumber = options?.hasTitleNumber ?? true;

  // Build assumption items dynamically — title number line is conditional
  const items: string[] = [];

  if (hasTitleNumber) {
    items.push('Land Registry Title \u2013 {{LAND_REGISTRY_TITLE}} ({{TENURE_TYPE}}). It is assumed the vendor has an unencumbered {{TENURE_TYPE_LOWER}} title, unless otherwise stated.');
  }

  items.push(
    'Land Registry House Price Index - Specifically the {{LOCAL_AUTHORITY}}.',
    'Land Registry House Price Index - Published sales figures for properties in the Postal District {{POSTAL_DISTRICT}}.',
    'Soil Survey - Geological, mining and soil investigation reports have not been obtained, nor have such reports been inspected. It is not therefore possible for us to certify that any land is capable of further development or redevelopment at a reasonable cost for the use which it is allocated in the relevant Structure Plan or for which Planning Consent could be obtained or that any present structures are unaffected by actual or potential settlement due to mining, low ground bearing capacity etc. or underground vegetation growth such as Japanese Knotweed etc.',
    'Contamination, Hazardous Substances and Environmental Matters - We have not arranged for any investigation to be carried out to determine whether or not any deleterious or hazardous material may be present at the site/property or in the surrounding area. Nor have we carried out any investigation into past or present uses either of the property or of any neighbouring land to establish whether there is any contamination or potential for contamination to the subject property from these uses or sites. We are, therefore, unable to report that the property is free from risk in this respect. For the purpose of this valuation, we have assumed that such investigation would not disclose the presence of any such material to any significant extent. However, should it be established subsequently that contamination, seepage or pollution exists at the property or on any neighbouring land, or that the premises have been or are being put to a contaminative use, this might reduce the values now reported.',
  );

  if (isInspected) {
    items.push(
      'Floor Areas - We have relied upon our own measurements and have calculated internal floor areas in accordance with the Code of Measuring Practice issued by the Royal Institution of Chartered Surveyors.',
    );
  }

  items.push(
    'Statutory Requirements - Unless stated to the contrary in the reports upon title, we have assumed that the properties comply with all necessary statutory requirements including fire and building regulations.',
    'Planning - Where necessary we have made informal, verbal enquiries of local planning and other relevant public Authorities. Unless it is apparent from such verbal enquiries, we have assumed that the property and its use comply with current planning requirements and legislation.',
    'Information - We have assumed that the information supplied to us in respect of the property is correct and that details of all matters likely to affect value have either been made available to us or are known to us and that the information is up to date.',
    'Plant and Machinery - Our valuation has been undertaken on the basis that it includes such fittings as would normally be regarded as fixtures and fittings.',
  );

  // Build the numbered output
  const preamble = [
    '3.1. In undertaking our valuation, we have made a number of assumptions and have relied upon certain sources of information. These matters are referred to below and within Appendix 1:',
  ];

  items.forEach((item, i) => {
    preamble.push('', `3.1.${i + 1}. ${item}`);
  });

  return preamble.join('\n');
}

// --- Section 4: Inspection ---

function getInspection(reportType: ReportType): string {
  const isInspected = isInspectedType(reportType);

  if (isInspected) {
    return [
      '4.1. We have no previous knowledge of the Property.',
      '',
      '4.2. Our instructions are that we attend at the Property, carry out an inspection and prepare a Market Valuation as at {{VALUATION_DATE}}.',
      '',
      '4.3. The inspection of the Property was carried out during the {{INSPECTION_TIME_OF_DAY}} of {{INSPECTION_DATE}}.',
      '',
      '4.4. Weather conditions at the time of inspection were {{WEATHER_CONDITIONS}}.',
    ].join('\n');
  }

  return [
    '4.1. We have no previous knowledge of the Property.',
    '',
    '4.2. Our instructions are that we prepare a Market Valuation as at {{VALUATION_DATE}}. In arriving at our valuation, we generally receive information from yourself, your advisers, public and subscription websites, other estate agents and valuers and from our own records. We will apply professional skepticism and will check the information where reasonably possible. In the absence of evidence to the contrary, we will assume that information used in the valuation is correct. The valuer will further consider any sustainability and ESG factors that could affect the valuation.',
  ].join('\n');
}

// --- Section 16: Comparable Data Intro ---

function getComparableDataIntro(): string {
  return [
    '16.1. We are instructed to consider the Market Valuation of the Property as at {{VALUATION_DATE}}.',
    '',
    '16.2. In preparing our Report, we have had regard for the following comparable evidence:',
  ].join('\n');
}

// --- Section 17: Market Commentary ---

const MARKET_COMMENTARY = `Inflation has eased markedly from its 2022 peak but remains above target and volatile. CPI inflation was 3.8% year-on-year in July 2025, reflecting persistent services and regulated price pressures. The Bank of England reduced Bank Rate to 4% in August and continues to signal a data dependent approach, noting that inflation is expected to trend lower through late 2025 but that risks remain. Although policy is now easing at the margin, rates are still high in historical terms and continue to dampen Property market liquidity via borrowing costs and lender caution.

Following the August cut, markets now anticipate a shallow, gradual path to any further easing into 2026. Mortgage pricing has come off its mid-cycle highs but remains restrictive for many borrowers: average new two-year fixed rates were around 5% in August, with five-year fixes in the 4.8% - 5% range. Credit availability has improved modestly and house purchase approvals edged up to roughly 64,000 in June, yet both pricing and underwriting standards remain tighter than pre-2022 norms, keeping affordability stretched and activity below long-run averages.

Economic growth is subdued. GDP expanded by 0.3% in Q2 2025, with June output up 0.4% month-on-month, but momentum remains fragile amid soft external demand and tighter financial conditions. The labour market has loosened a little - unemployment rose to about 4.7% in the three months to June, vacancies have eased, and pay growth is cooling. Regular pay is still rising at roughly 5% year-on-year, leaving real pay growth only modestly positive as inflation falls.

The residential sales market shows tentative stabilisation at lower activity levels. The UK House Price Index recorded annual growth of 3.7% in June 2025, with an average price around \u00A3269,000. Transactions have improved from early year lows, with seasonally adjusted sales in July around 95,600 (up 4% year-on-year and 1% month-on-month), but overall volumes remain beneath pre-pandemic norms. Survey evidence points to subdued demand - the July RICS survey showed negative net balances for new buyer enquiries and agreed sales, and a softening price backdrop, particularly in southern regions. By contrast, the lettings market remains tight. Private rents continue to outpace earnings, rising by around 6% year-on-year UK-wide in July and closer to double-digit growth in London, reflecting persistent supply shortages and ongoing landlord retrenchment.

The cost-of-living squeeze continues to weigh on housing turnover and consumer facing Property. Although inflation has fallen and real pay has turned marginally positive, households remain pressured by higher housing, energy and food costs, and by the reset of older low-rate mortgages onto materially higher rates. Affordability constraints are therefore likely to persist through the year, keeping buyer sentiment cautious and reinforcing upward pressure on rents given limited rental supply.

On policy and regulation, the macro backdrop is now mildly supportive as monetary policy shifts from a plateau to a gradual easing bias. Housing specific measures remain in focus: the mortgage guarantee scheme has been extended on a standing basis and regulators have allowed greater flexibility on high loan-to-income lending at the margin, while planning reform aimed at streamlining local plan processes is progressing, albeit with impacts likely to be gradual. Energy efficiency compliance (EPC) remains a key medium-term consideration for both residential and commercial landlords, influencing capex plans and pricing, and adding to the polarisation between prime, future-proofed assets and secondary stock. Near-term sentiment is also sensitive to potential tax and regulatory changes ahead of the autumn fiscal event, which may affect timing of transactions in some segments.

In conclusion, as at the valuation date, we consider that we can attach less weight to previous market evidence for comparison purposes, to inform opinions of value. Indeed, the current reaction to the economic climate means that we are faced with an unprecedented set of circumstances on which to base a judgement. Our valuation(s) is / are therefore reported on the basis of \u2018material valuation uncertainty\u2019 as per VPS 3 and VPGA 10 of the RICS Red Book Global. Consequently, less certainty \u2013 and a higher degree of caution \u2013 should be attached to our valuation than would normally be the case. Given the unknown future impact that macro-economy might have on the real estate market, we recommend that you keep the valuation under frequent review.

Appendix 1 lists the RICS Standard Valuation Terms and Conditions and assumptions that are applicable to this Valuation Report.`;

// Non-IHT version includes the Commercial Property paragraph
const COMMERCIAL_PROPERTY_PARAGRAPH = `Commercial Property conditions are mixed and highly quality-selective. Prime central London offices and modern logistics assets remain comparatively resilient, supported by flight-to-quality occupier demand, while secondary offices continue to face higher vacancy, retrofit requirements and pressure on rents. Retail occupier demand is generally weak outside prime locations, with secondary high street and shopping centre space under particular pressure. Investment activity is improving gradually from late-2024 lows but remains cautious and selective, with higher yields required outside core assets and locations and underwriting focused on income resilience and ESG compliance.`;

function getMarketCommentaryForType(reportType: ReportType, settings?: UserSettings | null): string {
  const isIHT = isIHTType(reportType);

  // If settings have custom commentary, use that
  if (settings) {
    const custom = isIHT ? settings.marketCommentaryIht : settings.marketCommentaryNonIht;
    if (custom && custom.trim()) return custom;
  }

  // Default: IHT uses the base commentary, non-IHT inserts Commercial Property paragraph
  if (isIHT) {
    return MARKET_COMMENTARY;
  }

  // Insert Commercial Property paragraph after the residential sales paragraph
  const paragraphs = MARKET_COMMENTARY.split('\n\n');
  // Insert after paragraph 4 (index 3) — the residential sales paragraph
  paragraphs.splice(4, 0, COMMERCIAL_PROPERTY_PARAGRAPH);
  return paragraphs.join('\n\n');
}

function getSignatureBlockForType(reportType: ReportType, settings?: UserSettings | null): string {
  const name = settings?.signatoryName || 'Nicholas Green MRICS';
  const firmName = settings?.firmName || 'The CoreProp Group';

  if (isIHTType(reportType)) {
    const title = settings?.signatoryTitleIht || 'RICS Registered Valuer';
    return `${name}\n${title}`;
  }

  const title = settings?.signatoryTitleOther || 'RICS Registered Valuer\nGroup Managing Director';
  return `${name} on behalf of ${firmName}\n${title}`;
}

// --- Valuation Conclusion ---

function getValuationConclusion(): string {
  return 'In conclusion, we give the Market Value of the Property, {{TENURE_TYPE}}, with assumed full vacant possession, as at {{VALUATION_DATE}} to be \u00A3{{VALUATION_FIGURE}} ({{VALUATION_WORDS}}).';
}

// --- Auction Reserve Section ---

function getAuctionReserveSection(reportType: ReportType): string | null {
  if (!isAuctionType(reportType)) {
    return null;
  }

  return [
    'The reserve price below has been set at a deliberately conservative level to encourage strong interest, maximise engagement, and drive competitive bidding on the day of auction. This approach is designed to generate early momentum and create a sense of accessibility for a broader pool of potential buyers. Once bidders are emotionally invested in the process, they are often more inclined to continue bidding beyond their initial limits, particularly in a live, time-pressured auction environment. The aim is to foster competition and stimulate a sense of urgency, both of which are proven to enhance final sale outcomes. Setting the reserve at a lower point does not reflect a reduced view of value, but rather a strategic decision to increase market traction, generate active bidding, and achieve the best possible sale price through competitive tension. This is especially important in a cautious or price-sensitive market, where buyer confidence and momentum can have a material impact on results.',
    '',
    'If the Property is to be sold via a public auction, we recommend an auction reserve in {{AUCTION_MONTH_YEAR}} at a sum of \u00A3{{AUCTION_RESERVE}} ({{AUCTION_RESERVE_WORDS}}).',
  ].join('\n');
}

// --- Appendix 1: RICS Standard T&Cs ---

const APPENDIX_1_TEMPLATE = `The CoreProp Group - RICS Standard Valuation Terms and Conditions

It is important to read these Terms and Conditions carefully as they form the basis of the contract between the parties and the use of the valuation report.

1. The instruction is in respect of a market valuation report and will be based upon an inspection (if applicable) of the subject property by a suitably qualified valuer who will then produce a standard format valuation report which is subject to a number of assumptions as detailed in the RICS Valuation \u2013 Global Standards.

2. The Valuation Report is prepared for the sole use of the client(s) and their professional advisors, and not for bank lending purposes.

3. This service is intended for use only in situations where the client requires a valuation report and do not require specific specialist advice on the condition of the property.

4. The property will be valued by means of the comparable method of valuation, unless otherwise stated in the report.

5. Neither the whole nor any part of the Valuation Report or any reference hereto may be included in any published documents, circular or statement or published in any way without the valuer's written approval of the form and context in which it may appear.

6. The valuation will be undertaken in accordance with the Internal Valuation Standards (IVS) of the International Valuation Standards Council.

7. The valuation will be undertaken in accordance with the RICS Professional Statements applicable at the date of inspection and the RICS Valuation \u2013 Global Standards 2024, effective from 31 January 2025 also known as "The Red Book".

8. The extent of the property to be inspected (if applicable) will be as defined by the client or, in the absence of such definition, the extent that appears to be reasonable to the valuer having regard to the available evidence on site.

9. If applicable, the valuer will undertake a brief, limited inspection of the subject property, sufficient only to form an opinion of value. The valuer will not carry out a survey and will not inspect any part of the structure which is covered unexposed or inaccessible. Carpets will not be lifted and furniture will not be moved.

10. If applicable, the valuer will inspect the outside of the main building from ground level and from within the property boundaries and where necessary adjoining public highways with the aid of binoculars where appropriate.

11. If applicable, the valuer will inspect the grounds and boundaries sufficient only to the extent that is necessary to form an opinion of value.

12. If the property is a flat, the valuer will also inspect the exterior of the building and any common or shared parts only to the extent necessary to form an opinion of value.

13. The valuer will visually inspect sufficiently to determine the type and nature of the service connections but will not operate or undertake any test any systems and will not lift drainage inspection chamber covers.

14. The valuer may further limit the inspection should it be considered necessary due to either personal security or Health and Safety issues.

15. The signee of the report will be a Fellow, or Member of the Royal Institution of Chartered Surveyors (RICS) and a member of the RICS Valuer Registration Scheme and who is registered with the RICS to undertake such instructions and has the appropriate knowledge, skills and understanding to inspect, value and report upon the subject property. The person inspecting on behalf of the valuer (if not the valuer themselves) will have the appropriate knowledge, skills and understanding to inspect the subject property.

16. The valuer will be under the duty of care of The CoreProp Group Ltd.

17. The valuer will act in accordance with the RICS Valuation \u2013 Global Standards as amended from time to time. Compliance with these standards may be subject to monitoring under RICS conduct and disciplinary regulations.

18. The valuer will have suitable equipment for inspecting and measuring the property which will be used where deemed to be necessary safe and practical at the valuer's discretion.

19. The valuer will immediately inform you of any known or suspected conflicts of interest, if applicable and will then confirm your instructions before proceeding further.

20. The valuer will not be acting as an expert within the meaning of Part 35 of the Civil Procedure Rule.

21. The valuer will produce a report in standard format which will include an opinion of the market value of the relevant interest in the property.

22. The date of valuation will be assumed to be the date of inspection unless instructed otherwise or if the instruction is in relation to a valuation for probate (IHT) cases in which case the date of valuation will be as stated in the instruction.

23. The valuation will be of the freehold/leasehold interest in the property. If you are unable to specify the tenure the valuer will make one of more assumptions as considered appropriate and as set out below.

24. The valuation will be on the basis of Market Value and/or Market Rent as appropriate and as described below.

25. Market Value is defined as 'The estimated amount for which an asset or liability should exchange on the valuation date between a willing buyer and a willing seller in an arm's length transaction, after proper marketing and where the parties had each acted knowledgeably, prudently and without compulsion.'

26. Market Rent is defined as 'The estimated amount for which an interest in real property should be leased on the valuation date between a willing lessor and a willing lessee on appropriate lease terms in an arm's length transaction, after proper marketing and where the parties had acted knowledgeably, prudently and without compulsion.'

27. Valuation Date is defined as "The date on which the opinion of value applies. The valuation date shall also include the time at which it applies if the true value of the type of asset can change materially in the course of a single day".

28. The report is provided strictly for your own use and it is valid only for the stated purpose. It is confidential to you and your professional advisers. As an RICS member, the valuer may be required to disclose the report to RICS Regulation as part of its work to ensure that RICS professional standards are being maintained.

29. The valuer accepts responsibility to you that the report will be prepared with the skill, care and diligence reasonably expected of a Competent Chartered Surveyor, but accepts no responsibility whatsoever to any other person. Any such person who relies upon the report does so as his or her own risk.

30. Unless specifically instructed otherwise, the valuer will make a number of assumptions about legal matters and the construction and use of the property, as set out below. Any other assumptions will be clearly stated in the report. The valuer will not be under any duty to verify these assumptions.

31. The valuer will assume that any relevant information provided by you or your professional advisors is accurate. It is your responsibility to advise the valuer if you become aware of any errors or omissions.

32. The valuer will assume that the property is not subject to any unusual or especially onerous restrictions, encumbrances or outgoings and that good legal title can be shown.

33. A valuation provided on the Market Value basis will be on the assumption of a sale with vacant possession, unless otherwise stated in the report.

34. A valuation provided on the Market Rent basis will be on the assumption that the property is vacant, unfurnished and is available to let for a period of 6 months on a single assured shorthold tenancy, unless otherwise stated in the report.

35. The valuer will assume that an inspection of those parts which have not been inspected would not reveal any material defects or cause the valuer to alter the valuation.

36. The valuer will assume that no high alumina cement, calcium chloride, asbestos or other potentially deleterious or hazardous materials were used in the construction of the property or have since been incorporated.

37. The valuer will not undertake or commission a site investigation and will assume that the site is not land filled and is not adversely affected by any underground mining or other works, invasive vegetation, radon, methane or other gases or any actual or potential contamination or flooding. The valuer will assume that the land is of adequate bearing capacity for its present and potential uses.

38. The valuer will assume that the property and its value are unaffected by any planning, building, highway or other matters which would be revealed by a local search and replies to the usual enquiries, or, by any statutory notice and that neither the property, not its condition, nor its actual or intended use, is or will be unlawful.

39. The valuer will assume that all usual mains services are connected or are available under normal terms and that the roads, sewers and services outside the cartilage of the property are the responsibility of the Local Authority or other statutory body.

40. The CoreProp Group Limited is regulated by RICS for the provision of surveying services (firm no. {{FIRM_RICS_NUMBER}}). This means we agree to uphold the RICS Rules of Conduct for Firms and all other applicable mandatory professional practice requirements of RICS, which can be found at www.rics.org. As an RICS regulated firm we have committed to cooperating with RICS in ensuring compliance with its standards. The firm's nominated RICS Responsible Principal is {{FIRM_SIGNATORY}} whom is a Partner of this firm and can be reached at {{FIRM_EMAIL}} or {{FIRM_PHONE}}.

41. The firm has a complaints handling procedure and a copy can be sent to you upon request.`;

/**
 * Returns the Appendix 1 T&Cs with firm details filled in from settings.
 */
function getAppendix1(settings?: UserSettings | null): string {
  if (settings?.termsAndConditions?.trim()) return settings.termsAndConditions;

  return APPENDIX_1_TEMPLATE
    .replace(/\{\{FIRM_RICS_NUMBER\}\}/g, settings?.firmRicsNumber || '863315')
    .replace(/\{\{FIRM_SIGNATORY\}\}/g, settings?.signatoryName || 'Nicholas Green MRICS')
    .replace(/\{\{FIRM_EMAIL\}\}/g, settings?.firmEmail || 'nick.green@coreprop.co.uk')
    .replace(/\{\{FIRM_PHONE\}\}/g, settings?.firmPhone || '0203 143 0123');
}

// ============================================================
// Main Template Generator
// ============================================================

/**
 * Returns the complete boilerplate report template for the given report type.
 * Each section contains {{VARIABLE}} placeholders to be filled via `fillTemplate`.
 *
 * Sections 5-15 (property description, location, accommodation, condition, etc.)
 * are AI-generated from structured form inputs and are not included in the template.
 */
export function getReportTemplate(
  reportType: ReportType,
  settings?: UserSettings | null,
  options?: { hasTitleNumber?: boolean },
): ReportTemplate {
  // Use custom T&Cs from settings if available, otherwise use default with firm details filled
  const appendix1 = getAppendix1(settings);

  return {
    instructions: getInstructions(reportType),
    basisOfValuation: getBasisOfValuation(reportType),
    assumptionsAndSources: getAssumptionsAndSources(reportType, { hasTitleNumber: options?.hasTitleNumber }),
    inspection: getInspection(reportType),
    comparableDataIntro: getComparableDataIntro(),
    marketCommentary: getMarketCommentaryForType(reportType, settings),
    valuationConclusion: getValuationConclusion(),
    auctionReserveSection: getAuctionReserveSection(reportType),
    signatureBlock: getSignatureBlockForType(reportType, settings),
    appendix1,
  };
}

// Export defaults for seeding the settings table
export const DEFAULT_MARKET_COMMENTARY_IHT = MARKET_COMMENTARY;
export const DEFAULT_MARKET_COMMENTARY_NON_IHT = (() => {
  const paragraphs = MARKET_COMMENTARY.split('\n\n');
  paragraphs.splice(4, 0, COMMERCIAL_PROPERTY_PARAGRAPH);
  return paragraphs.join('\n\n');
})();
