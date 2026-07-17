import { jsPDF } from 'jspdf';
import toast from 'react-hot-toast';
import { formatTimeAndPeriod } from './timeHelper';

function cleanForPDF(text: string): string {
  if (!text) return '';
  return text
    .replace(/₹/g, 'INR ')
    .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
}

export const downloadItineraryPDF = (context: any) => {
  if (!context) return;

  try {
    const doc = new jsPDF();
    let y = 20;

    // Header helper for subsequent pages
    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > 275) {
        doc.addPage();
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 140);
        doc.text(`TRIPPLANNER AI ITINERARY - DESTINATION: ${(context.input.destination || 'TRIP').toUpperCase()}`, 15, 10);
        doc.setDrawColor(226, 232, 240);
        doc.line(15, 12, 195, 12);
        y = 22;
      }
    };

    // 1. Branding Header Banner
    doc.setFillColor(30, 41, 59); // Dark blue gray/navy
    doc.rect(15, y, 180, 24, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('TRIPPLANNER AI - TRIP PLAN ITINERARY', 22, y + 15);
    y += 32;

    // 2. Summary Details Card
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(15, y, 180, 42, 'FD');
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10.5);

    // Col 1
    doc.setFont('Helvetica', 'bold');
    doc.text('Destination:', 20, y + 10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`${context.input.destination || 'N/A'}`, 48, y + 10);

    doc.setFont('Helvetica', 'bold');
    doc.text('Origin:', 20, y + 18);
    doc.setFont('Helvetica', 'normal');
    doc.text(`${context.input.origin || 'N/A'}`, 48, y + 18);

    doc.setFont('Helvetica', 'bold');
    doc.text('Dates:', 20, y + 26);
    doc.setFont('Helvetica', 'normal');
    doc.text(`${context.input.start_date || 'N/A'} to ${context.input.end_date || 'N/A'}`, 48, y + 26);

    doc.setFont('Helvetica', 'bold');
    doc.text('Travelers:', 20, y + 34);
    doc.setFont('Helvetica', 'normal');
    doc.text(`${context.input.travelers || 1} guest(s)`, 48, y + 34);

    // Col 2
    const selectedHotelName = context.accommodation?.recommended || context.accommodation?.selected_hotel?.name || 'Self Arranged';
    const transportProvider = context.transport?.selected_option 
      ? `${context.transport.selected_option.operator} (${context.transport.selected_option.mode})`
      : (context.transport?.options?.[0]
        ? `${context.transport.options[0].operator} (${context.transport.options[0].mode})`
        : 'Self Arranged');

    doc.setFont('Helvetica', 'bold');
    doc.text('Accommodation:', 112, y + 10);
    doc.setFont('Helvetica', 'normal');
    
    // Make Hotel Name a clickable link in the header card
    if (selectedHotelName && selectedHotelName !== 'Self Arranged' && selectedHotelName !== 'Hotel') {
      doc.setTextColor(79, 70, 229); // indigo link color
      let truncatedHotelName = selectedHotelName.length > 22 ? selectedHotelName.substring(0, 20) + '...' : selectedHotelName;
      const hotelCardMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        context.accommodation?.selected_hotel?.address
          ? `${selectedHotelName}, ${context.accommodation.selected_hotel.address}`
          : (context.accommodation?.selected_hotel?.vicinity 
            ? `${selectedHotelName}, ${context.accommodation.selected_hotel.vicinity}` 
            : `${selectedHotelName} ${context.input?.destination || ''}`)
      )}`;
      doc.textWithLink(truncatedHotelName, 148, y + 10, { url: hotelCardMapsUrl });
      
      // draw underline
      const wCard = doc.getTextWidth(truncatedHotelName);
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(0.15);
      doc.line(148, y + 10.5, 148 + wCard, y + 10.5);
    } else {
      doc.text(selectedHotelName, 148, y + 10);
    }
    doc.setTextColor(30, 41, 59); // Reset

    doc.setFont('Helvetica', 'bold');
    doc.text('Main Transit:', 112, y + 18);
    doc.setFont('Helvetica', 'normal');
    let truncatedTransitGroup = transportProvider.length > 22 ? transportProvider.substring(0, 20) + '...' : transportProvider;
    doc.text(truncatedTransitGroup, 148, y + 18);

    doc.setFont('Helvetica', 'bold');
    doc.text('Budget Ceiling:', 112, y + 26);
    doc.setFont('Helvetica', 'normal');
    doc.text(`INR ${(context.input.budget_inr || 30000).toLocaleString()}`, 148, y + 26);

    doc.setFont('Helvetica', 'bold');
    doc.text('Feasibility:', 112, y + 34);
    doc.setFont('Helvetica', 'normal');
    doc.text(context.budget?.is_feasible ? 'Feasible (Within Budget)' : 'Over Budget Constraint', 148, y + 34);

    y += 50;

    // 3. Booking references if confirmed
    if (context.booking?.refs) {
      checkPageBreak(30);
      doc.setDrawColor(99, 102, 241);
      doc.setFillColor(245, 243, 255);
      doc.rect(15, y, 180, 18, 'FD');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(109, 40, 217); // Purple
      doc.text('CONFIRMED RESERVATIONS & BOOKING REFERENCES:', 20, y + 6);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8.5);
      doc.text(`Hotel Booking Ref: ${context.booking.refs.hotel || 'N/A'}    |    Transit Booking Ref: ${context.booking.refs.transport || 'N/A'}    |    Sync: ${context.booking.refs.calendar || 'Completed'}`, 20, y + 12);
      
      y += 26;
    }

    // 4. Budget summary table
    if (context.budget) {
      checkPageBreak(75);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('Planned Budget Breakdown & Cost Analysis', 15, y);
      y += 6;

      // Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, 180, 8, 'F');
      doc.setFontSize(8.5);
      doc.setFont('Helvetica', 'bold');
      doc.text('Expense Category', 20, y + 5.5);
      doc.text('Cost (INR)', 160, y + 5.5);
      y += 8;

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      
      const budgetCategoryRows = [
        { name: 'Main Transit (Outbound & Return Commutes)', cost: context.budget.transport || 0 },
        { name: 'Lodging (Hotel / Accommodation stays)', cost: context.budget.accommodation || 0 },
        { name: 'Food & Meals budget allocation', cost: context.budget.food || 0 },
        { name: 'Local Sightseeing & Activities (Entry Fees)', cost: context.budget.activities || 0 },
        { name: 'Local Transport (Taxi / Auto Rickshaw commutes)', cost: context.budget.local_transport || 0 },
        { name: 'Emergency backup reserve logic (10%)', cost: context.budget.emergency_fund || 0 },
      ];

      budgetCategoryRows.forEach(row => {
        doc.text(row.name, 20, y + 5.5);
        doc.text(`INR ${Number(row.cost).toLocaleString()}`, 160, y + 5.5);
        doc.setDrawColor(241, 245, 249);
        doc.line(15, y + 8, 195, y + 8);
        y += 8;
      });

      // Total sum
      const estimatedTotalVal = context.budget.total_cost_inr ?? context.budget.total_estimated_cost ?? 0;
      doc.setFont('Helvetica', 'bold');
      doc.setFillColor(236, 253, 245);
      doc.rect(15, y, 180, 9, 'F');
      doc.setTextColor(16, 185, 129); // green
      doc.text('TOTAL ESTIMATED TRIP COST', 20, y + 6);
      doc.text(`INR ${estimatedTotalVal.toLocaleString()}`, 160, y + 6);
      y += 18;
    }

    // 5. Curated Day-to-Day Timeline Planner
    if (context.itinerary?.days && Array.isArray(context.itinerary.days)) {
      checkPageBreak(25);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(79, 70, 229); // Indigo
      doc.text('Curated Chronological Timeline Itinerary', 15, y);
      y += 8;

      context.itinerary.days.forEach((day: any) => {
        checkPageBreak(35);
        // Day title bar
        doc.setFillColor(99, 102, 241); // Indigo-500
        doc.rect(15, y, 180, 9, 'F');
        doc.setFontSize(9.5);
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        
        const title = `Day ${day.day}: ${cleanForPDF(day.title || 'Sightseeing schedule')}`;
        doc.text(title, 20, y + 6);
        if (day.daily_total_inr > 0) {
          doc.text(`Estimated Spend: INR ${day.daily_total_inr.toLocaleString()}`, 148, y + 6);
        }
        y += 9;

        // Weather block
        if (day.weather_note) {
          doc.setFillColor(239, 246, 255);
          doc.rect(15, y, 180, 6, 'F');
          doc.setFontSize(8.5);
          doc.setFont('Helvetica', 'oblique');
          doc.setTextColor(30, 41, 59);
          
          const cleanedWeather = cleanForPDF(day.weather_note);
          doc.text(`Weather Status: ${cleanedWeather}`, 20, y + 4.5);
          y += 6;
        }
        y += 4;

        // Prepend chosen hotel base node in timeline list
        if (selectedHotelName && selectedHotelName !== 'Self Arranged' && selectedHotelName !== 'Hotel') {
          checkPageBreak(22);
          const hotelNodeStartY = y;

          // Timeline dot for hotel
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(99, 102, 241);
          doc.setLineWidth(0.4);
          doc.circle(20, y + 3.5, 1.2, 'FD');

          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(99, 102, 241);
          doc.text('Base Hotel Stay', 24, y + 4.5);

          y += 9;

          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(79, 70, 229); // clickable link style
          
          const hotelMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            context.accommodation?.selected_hotel?.address
              ? `${selectedHotelName}, ${context.accommodation.selected_hotel.address}`
              : (context.accommodation?.selected_hotel?.vicinity 
                ? `${selectedHotelName}, ${context.accommodation.selected_hotel.vicinity}` 
                : `${selectedHotelName} ${context.input?.destination || ''}`)
          )}`;
          doc.textWithLink(selectedHotelName, 24, y, { url: hotelMapsUrl });
          
          const hotelLinkWidth = doc.getTextWidth(selectedHotelName);
          doc.setDrawColor(79, 70, 229);
          doc.setLineWidth(0.15);
          doc.line(24, y + 0.5, 24 + hotelLinkWidth, y + 0.5);
          
          y += 6;

          // Connector line for hotel item
          doc.setDrawColor(99, 102, 241);
          doc.line(20, hotelNodeStartY, 20, y);
          y += 2;
        }

        // Schedule items
        if (day.schedule && Array.isArray(day.schedule) && day.schedule.length > 0) {
          day.schedule.forEach((action: any) => {
            // Estimate height for page break check
            let itemH = 15;
            if (action.transport_note) itemH += 5;
            checkPageBreak(itemH);
            
            const itemStartY = y;
            
            // Timeline connector circle
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(99, 102, 241);
            doc.setLineWidth(0.4);
            doc.circle(20, y + 3.5, 1.2, 'FD');

            // Period and Costs
            const formattedTime = formatTimeAndPeriod(action.time) || action.time;
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(99, 102, 241);
            doc.text(formattedTime, 24, y + 4.5);

            // Cost string
            let priceDetails = '';
            if (action.cost_inr > 0) priceDetails += `Entry: INR ${action.cost_inr.toLocaleString()}`;
            if (action.travel_cost_inr > 0) {
              if (priceDetails) priceDetails += '  |  ';
              priceDetails += `Commute: INR ${action.travel_cost_inr.toLocaleString()}`;
            }
            if (priceDetails) {
              doc.setFont('Helvetica', 'bold');
              doc.setFontSize(8);
              doc.setTextColor(16, 185, 129);
              doc.text(priceDetails, 150, y + 4.5);
            }
            y += 10; // spacing between time row and activity row

            // Activity name & Location link drawing
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(30, 41, 59);

            let activityText = action.activity;
            let hasLink = false;
            let locationName = '';
            let mapsUrl = '';

            if (action.location) {
              locationName = action.location;
              const placeQuery = action.location;
              const matchOpt = context.activities?.attraction_options?.find((opt: any) => opt.name?.toLowerCase() === locationName.toLowerCase());
              const queryStr = matchOpt?.vicinity && !matchOpt.vicinity.includes('Hotelbeds')
                ? `${placeQuery}, ${matchOpt.vicinity}`
                : `${placeQuery}, ${context.input?.destination || ''}`;
              mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryStr)}`;
              hasLink = true;
              
              if (!activityText.toLowerCase().includes(locationName.toLowerCase())) {
                activityText += ' at ';
              }
            }

            doc.text(activityText, 24, y);
            
            if (hasLink && locationName) {
              const activityWidth = doc.getTextWidth(activityText);
              doc.setTextColor(79, 70, 229);
              doc.textWithLink(locationName, 24 + activityWidth, y, { url: mapsUrl });
              
              const locationWidth = doc.getTextWidth(locationName);
              doc.setDrawColor(79, 70, 229);
              doc.setLineWidth(0.15);
              doc.line(24 + activityWidth, y + 0.5, 24 + activityWidth + locationWidth, y + 0.5);
              
              doc.setTextColor(30, 41, 59); // Reset color
            }
            y += 6; // Move below activity line

            // Transport note
            if (action.transport_note) {
              doc.setFont('Helvetica', 'oblique');
              doc.setFontSize(8);
              doc.setTextColor(100, 116, 139);
              const cleanedTransitLine = cleanForPDF(action.transport_note);
              doc.text(`   ${cleanedTransitLine}`, 24, y);
              y += 5; // Move below transport note line
            }
            
            // Draw timeline segment
            doc.setDrawColor(99, 102, 241);
            doc.setLineWidth(0.4);
            doc.line(20, itemStartY, 20, y);
            
            y += 3; // buffer spacing between timeline nodes
          });
        } else {
          doc.setFont('Helvetica', 'oblique');
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139);
          doc.text('Leisure & rest hours.', 25, y + 4.5);
          y += 8;
        }
        y += 5;
      });

      // 6. Curated Notes
      if (context.itinerary.notes) {
        checkPageBreak(30);
        
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.rect(15, y, 180, 22, 'FD');
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(79, 70, 229);
        doc.text('Core Notes & Recommendations:', 20, y + 6);
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        const splitNotes = doc.splitTextToSize(cleanForPDF(context.itinerary.notes), 170);
        doc.text(splitNotes, 20, y + 12);
      }
    }

    // Download
    doc.save(`TripPlanner_Itinerary_${context.input.destination || 'Trip'}.pdf`);
    toast.success('Successfully downloaded PDF Itinerary! 📄');
  } catch (err: any) {
    console.error(err);
    toast.error('Failed to generate PDF document.');
  }
};
