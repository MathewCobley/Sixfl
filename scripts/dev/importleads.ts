// ========================================
// File: scripts/importLeads.ts
// ========================================

import { prisma } from "@/lib/prisma";

async function main() {
  const leads = [
    {
      interestType: "TEAM",
      contactName: "Matthew Shipside",
      email: "matthewshipside@gmail.com",
      phone: "07817882340",
      teamName: "Marks & Benders",
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: true,
      marketingConsent: false,
      preferredNights: ["MONDAY"],
    },
    {
      interestType: "TEAM",
      contactName: "Jamie Shaw",
      email: "shawjj05@gmail.com",
      phone: undefined,
      teamName: "Old Boys FC",
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: true,
      marketingConsent: true,
      preferredNights: ["TUESDAY"],
    },
    {
      interestType: "TEAM",
      contactName: "John Cotterill",
      email: "john@johncotterill.co.uk",
      phone: undefined,
      teamName: "Portly Pig",
      area: "Ripon",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: true,
      preferredNights: ["ANY"],
    },
    {
      interestType: "TEAM",
      contactName: "Thijs van Gulik",
      email: "thijsvangulik@hotmail.com",
      phone: undefined,
      teamName: "Tbd",
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: false,
      preferredNights: ["TUESDAY"],
    },
    {
      interestType: "TEAM",
      contactName: "Harry Lee",
      email: "haz1109@icloud.com",
      phone: "07591737834",
      teamName: "Pathetico Madrid",
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: true,
      marketingConsent: true,
      preferredNights: ["MONDAY"],
    },
    {
      interestType: "TEAM",
      contactName: "Henry Davis",
      email: "henrydavis04@icloud.com",
      phone: "07407783789",
      teamName: "Wenlock warriors",
      area: "Harrogate",
      leagueType: "YOUTH",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: true,
      marketingConsent: true,
      preferredNights: ["TUESDAY"],
    },
    {
      interestType: "PLAYER",
      contactName: "Jake Crawley",
      email: "jakecrawley1703@gmail.com",
      phone: undefined,
      teamName: undefined,
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: false,
      preferredNights: ["THURSDAY"],
    },
    {
      interestType: "PLAYER",
      contactName: "Glenn Sagar",
      email: "glensagar@hotmail.co.uk",
      phone: undefined,
      teamName: undefined,
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: false,
      preferredNights: ["TUESDAY"],
    },
    {
      interestType: "PLAYER",
      contactName: "Oni Oluwatimilehin",
      email: "onitimilehin2000@gmail.com",
      phone: "07827793140",
      teamName: undefined,
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: true,
      preferredNights: ["ANY"],
    },
    {
      interestType: "PLAYER",
      contactName: "Tom Cunningham",
      email: "tomcunningham286@gmail.com",
      phone: "07502 523328",
      teamName: undefined,
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: true,
      preferredNights: ["WEDNESDAY"],
    },
    {
      interestType: "PLAYER",
      contactName: "Ghassan",
      email: "g2gastin@hotmail.com",
      phone: "07391481457",
      teamName: undefined,
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: true,
      preferredNights: ["ANY"],
    },
    {
      interestType: "PLAYER",
      contactName: "Clint K",
      email: "web.dubiously843@slmails.com",
      phone: undefined,
      teamName: undefined,
      area: "Harrogate",
      leagueType: "MENS",
      message: undefined,
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: true,
      preferredNights: ["TUESDAY"],
    },
    {
      interestType: "PLAYER",
      contactName: "Jenni Neville",
      email: "jstrangeway@yahoo.com",
      phone: "07443173118",
      teamName: undefined,
      area: "Harrogate",
      leagueType: "WOMENS",
      message: "I live in Harrogate, immigrated from South Africa, striker",
      source: "register-interest-page",
      wantsFreeKit: false,
      marketingConsent: false,
      preferredNights: ["ANY"],
    },
  ];

  for (const lead of leads) {
    const created = await prisma.interestLead.create({
      data: {
        interestType: lead.interestType,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        teamName: lead.teamName,
        area: lead.area,
        leagueType: lead.leagueType,
        message: lead.message,
        source: lead.source,
        wantsFreeKit: lead.wantsFreeKit,
        marketingConsent: lead.marketingConsent,
      },
    });

    if (lead.preferredNights?.length) {
      for (const night of lead.preferredNights) {
        await prisma.interestLeadPreferredNight.create({
          data: {
            leadId: created.id,
            night: night as any,
          },
        });
      }
    }
  }

  console.log("✅ All leads imported");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });