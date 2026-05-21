'use client';

export type ParsedAwbFull = {
  awbNo: string; awbPrefix: string; awbSuffix: string;
  origin: string; destination: string; airlineName: string;
  flightNo: string; bookingDate: string;
  weight: number; chargeableWeight: number; pieces: number;
  baseRate: number; freightAmount: number; totalAmount: number;
  shipperName: string; consigneeName: string;
  totalOtherChargesDueAgent: number; totalOtherChargesDueCarrier: number;
  totalPrepaid: number; otherCharges: Record<string, number>;
};

export function parseAwbDocument(text: string): ParsedAwbFull {
  const t = text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');
  const flat = t.replace(/\n/g, ' ');

  const r: ParsedAwbFull = {
    awbNo:'', awbPrefix:'312', awbSuffix:'',
    origin:'', destination:'', airlineName:'', flightNo:'', bookingDate:'',
    weight:0, chargeableWeight:0, pieces:0, baseRate:0, freightAmount:0, totalAmount:0,
    shipperName:'', consigneeName:'',
    totalOtherChargesDueAgent:0, totalOtherChargesDueCarrier:0, totalPrepaid:0,
    otherCharges:{},
  };

  // AWB Number e.g. "312-27497061"
  const awbM = flat.match(/\b(\d{3})-(\d{7,8})\b/);
  if (awbM) { r.awbNo = awbM[0]; r.awbPrefix = awbM[1]; r.awbSuffix = awbM[2]; }

  // Airport codes
  const airportMap: Record<string,string> = {
    'BLR':'BLR','BENGALURU':'BLR','BANGALORE':'BLR','AMD':'AMD','AHMEDABAD':'AMD',
    'DEL':'DEL','DELHI':'DEL','BOM':'BOM','MUMBAI':'BOM','HYD':'HYD','HYDERABAD':'HYD',
    'MAA':'MAA','CHENNAI':'MAA','CCU':'CCU','KOLKATA':'CCU','COK':'COK','KOCHI':'COK',
    'JAI':'JAI','JAIPUR':'JAI','PNQ':'PNQ','PUNE':'PNQ','IDR':'IDR','INDORE':'IDR',
    'SXR':'SXR','SRINAGAR':'SXR','IXR':'IXR','RANCHI':'IXR','BHO':'BHO','BHOPAL':'BHO',
  };

  const originM = flat.match(/Airport of Departure[^A-Z]{0,30}([A-Z]{3})/i);
  if (originM) r.origin = airportMap[originM[1]] || originM[1];
  const destM = flat.match(/Airport of Destination\s+([A-Z]{3})/i);
  if (destM) r.destination = airportMap[destM[1]] || destM[1];

  // Fallback: scan "XXX-CITYNAME" patterns
  if (!r.origin || !r.destination) {
    const allAirports = [...flat.matchAll(/\b([A-Z]{3})-(BENGALURU|AHMEDABAD|DELHI|MUMBAI|HYDERABAD|CHENNAI|KOLKATA|KOCHI|JAIPUR|PUNE|INDORE|SRINAGAR|RANCHI|BHOPAL)\b/g)];
    if (allAirports.length >= 1 && !r.origin) r.origin = allAirports[0][1];
    if (allAirports.length >= 2 && !r.destination) r.destination = allAirports[1][1];
  }

  // Airline
  if (flat.includes('IndiGo') || flat.includes('InterGlobe') || /\b6E\b/.test(flat)) r.airlineName = 'IndiGo';
  else if (flat.includes('Air India') || /\bAI\b/.test(flat)) r.airlineName = 'Air India';
  else if (flat.includes('SpiceJet') || /\bSG\b/.test(flat)) r.airlineName = 'SpiceJet';
  else if (flat.includes('GoAir') || /\bG8\b/.test(flat)) r.airlineName = 'GoAir';
  else if (flat.includes('Akasa') || /\bQP\b/.test(flat)) r.airlineName = 'Akasa Air';
  else if (flat.includes('Vistara') || /\bUK\b/.test(flat)) r.airlineName = 'Vistara';

  // Flight number
  const flightM = flat.match(/\b(6E|AI|SG|G8|QP|UK)(\d{3,5})\b/);
  if (flightM) r.flightNo = flightM[1] + flightM[2];

  // Date
  const dateM = flat.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dateM) r.bookingDate = `${dateM[3]}-${dateM[2]}-${dateM[1]}`;
  if (!r.bookingDate) {
    const dateM2 = flat.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (dateM2) r.bookingDate = `${dateM2[3]}-${dateM2[2]}-${dateM2[1]}`;
  }

  // Pieces, Weight, Rate — pattern: "40 587.00 K Q AUP 587.00 39.00 22,893.00"
  const shipLineM = flat.match(/(\d+)\s+([\d,]+\.?\d*)\s+K\s+Q\s+(\w+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/);
  if (shipLineM) {
    r.pieces = parseInt(shipLineM[1]);
    r.weight = parseFloat(shipLineM[2].replace(/,/g,''));
    r.chargeableWeight = parseFloat(shipLineM[4].replace(/,/g,''));
    r.baseRate = parseFloat(shipLineM[5].replace(/,/g,''));
    r.freightAmount = parseFloat(shipLineM[6].replace(/,/g,''));
  }
  // Fallback weight
  if (!r.weight) {
    const wM = flat.match(/([\d,]+\.?\d*)\s+K(?:G|b)?\b/i);
    if (wM) r.weight = parseFloat(wM[1].replace(/,/g,''));
  }
  // Fallback pieces
  if (!r.pieces) {
    const pM = flat.match(/\b(\d{1,4})\s+(?:PCS|PIECES|PKGS|PACKAGES)\b/i);
    if (pM) r.pieces = parseInt(pM[1]);
  }

  // Shipper name
  const shipperM = t.match(/Shipper.s Name and Address\s*\n([\s\S]{0,200}?)(?:Shipper.s Account|Consignee)/i);
  if (shipperM) {
    const lines = shipperM[1].replace(/\n/g,' ').trim().split(/\s{2,}/);
    r.shipperName = lines[0]?.trim() || '';
  }

  // Consignee name
  const consigneeM = t.match(/Consignee.s Name and Address\s*\n([\s\S]{0,200}?)(?:Consignee.s Account|By first|Carrier)/i);
  if (consigneeM) {
    const lines = consigneeM[1].replace(/\n/g,' ').trim().split(/\s{2,}/);
    r.consigneeName = lines[0]?.trim() || '';
  }

  // Other charges
  const chargePatterns: [string, RegExp][] = [
    ['AWB Fees (Agent)',   /AA\/AWB FEES DUE AGENT\s*:\s*([\d,]+\.?\d*)/i],
    ['AWB Fees (Carrier)', /AC\/AWB FEES DUE CARRIER\s*:\s*([\d,]+\.?\d*)/i],
    ['Admin Charges',      /AD\/ADMINISTRATIVE CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Delivery Order',     /DO\/DELIVERY ORDER CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Fuel Surcharge',     /FS\/Fuel\s*Surcharge\s*:\s*([\d,]+\.?\d*)/i],
    ['X-Ray Screening',    /XS\/X-RAY\s*SCREENING CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Handling Charges',   /HC\/HANDLING CHARGES\s*:\s*([\d,]+\.?\d*)/i],
  ];
  chargePatterns.forEach(([key, regex]) => {
    const m = flat.match(regex);
    if (m) r.otherCharges[key] = parseFloat(m[1].replace(/,/g,''));
  });

  // Totals
  const agentTotalM = flat.match(/Total other Charges Due Agent\s*([\d,]+\.?\d*)/i);
  if (agentTotalM) r.totalOtherChargesDueAgent = parseFloat(agentTotalM[1].replace(/,/g,''));
  const carrierTotalM = flat.match(/Total other Charges Due Carrier\s*([\d,]+\.?\d*)/i);
  if (carrierTotalM) r.totalOtherChargesDueCarrier = parseFloat(carrierTotalM[1].replace(/,/g,''));
  const prepaidM = flat.match(/Total Prepaid\s+([\d,]+\.?\d*)/i)
    || flat.match(/([\d]{2},[\d]{3}\.\d{2})\s*INR/i);
  if (prepaidM) r.totalPrepaid = parseFloat(prepaidM[1].replace(/,/g,''));

  r.totalAmount = r.totalPrepaid || r.freightAmount + Object.values(r.otherCharges).reduce((s,v)=>s+v,0);

  return r;
}
