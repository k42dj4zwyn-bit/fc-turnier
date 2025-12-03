// ==============
//  Firebase Init
// ==============

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Deine Firebase-Konfiguration (aus der Konsole)
const firebaseConfig = {
  apiKey: "AIzaSyBCO_sBM3Ov4F6JiBbJRrN2ur2F_3IDX3g",
  authDomain: "fc-liga-4f209.firebaseapp.com",
  projectId: "fc-liga-4f209",
  storageBucket: "fc-liga-4f209.firebasestorage.app",
  messagingSenderId: "338463944746",
  appId: "1:338463944746:web:66e000540a2703da071353"
};

// Firebase & Firestore initialisieren
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Referenzen auf Collections
const teamsCol = collection(db, "teams");
const tournamentsCol = collection(db, "tournaments");

// =======================
//   Globale Zustände
// =======================

let teams = [];
let tournaments = [];
let selectedTournamentId = null;

// =======================
//   HILFSFUNKTIONEN
// =======================

function getTeamById(id) {
  return teams.find((t) => t.id === id) || null;
}

function getTeamName(id) {
  const t = getTeamById(id);
  return t ? t.name : "(Team gelöscht)";
}

// Round-Robin-Spielplan
function generateLeagueSchedule(teamIds) {
  const ids = [...teamIds];

  if (ids.length < 2) {
    return [];
  }

  // Bei ungerader Anzahl ein "Freilos" hinzufügen (wird ignoriert)
  if (ids.length % 2 === 1) {
    ids.push(null);
  }

  const teamCount = ids.length;
  const rounds = teamCount - 1;
  const half = teamCount / 2;

  let arr = ids.slice();
  const matches = [];

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[teamCount - 1 - i];

      if (home && away) {
        matches.push({
          id: crypto.randomUUID(),
          round,
          homeTeamId: home,
          awayTeamId: away,
          homeGoals: null,
          awayGoals: null,
          stage: "league",
          groupName: null,
          knockoutRound: null
        });
      }
    }

    // Rotation (außer erster Eintrag)
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }

  return matches;
}

// Tabelle berechnen für bestimmte Teams + Matches
function computeStandingsForTeams(teamIds, matches) {
  const statsMap = new Map();

  teamIds.forEach((teamId) => {
    statsMap.set(teamId, {
      teamId,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    });
  });

  matches.forEach((match) => {
    if (match.homeGoals == null || match.awayGoals == null) return;
    if (!statsMap.has(match.homeTeamId) || !statsMap.has(match.awayTeamId)) return;

    const home = statsMap.get(match.homeTeamId);
    const away = statsMap.get(match.awayTeamId);

    const hg = match.homeGoals;
    const ag = match.awayGoals;

    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;

    if (hg > ag) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (hg < ag) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  });

  const stats = Array.from(statsMap.values());

  stats.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.goalsFor - a.goalsAgainst;
    const diffB = b.goalsFor - b.goalsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    return 0;
  });

  return stats;
}

function getKnockoutRoundName(teamCount) {
  if (teamCount === 2) return "Finale";
  if (teamCount === 4) return "Halbfinale";
  if (teamCount === 8) return "Viertelfinale";
  if (teamCount === 16) return "Achtelfinale";
  return "K.o.-Runde";
}

async function saveTournament(tournament) {
  const ref = doc(tournamentsCol, tournament.id);
  await setDoc(ref, tournament);
}

// =======================
//   UI: TEAMS
// =======================

const teamForm = document.getElementById("team-form");
const teamNameInput = document.getElementById("team-name");
const teamShortInput = document.getElementById("team-short");
const teamList = document.getElementById("team-list");

const tournamentTeamOptionsDiv = document.getElementById("tournament-team-options");

function renderTournamentTeamOptions() {
  if (!tournamentTeamOptionsDiv) return;

  tournamentTeamOptionsDiv.innerHTML = "";

  if (teams.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Lege zuerst Teams an.";
    tournamentTeamOptionsDiv.appendChild(p);
    return;
  }

  teams.forEach((team) => {
    const label = document.createElement("label");
    label.className = "team-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = team.id;

    label.appendChild(checkbox);
    label.append(` ${team.name}`);
    tournamentTeamOptionsDiv.appendChild(label);
  });
}

function renderTeams() {
  teamList.innerHTML = "";

  if (teams.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Noch keine Teams angelegt.";
    teamList.appendChild(li);
  } else {
    teams.forEach((team) => {
      const li = document.createElement("li");
      li.className = "team-item";

      const left = document.createElement("div");
      const nameSpan = document.createElement("span");
      nameSpan.className = "team-name";
      nameSpan.textContent = team.name;

      left.appendChild(nameSpan);

      if (team.shortName) {
        const shortSpan = document.createElement("span");
        shortSpan.className = "team-short";
        shortSpan.textContent = `(${team.shortName})`;
        left.appendChild(shortSpan);
      }

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Löschen";
      removeBtn.addEventListener("click", async () => {
        if (!confirm(`Team "${team.name}" wirklich löschen?`)) return;
        const ref = doc(teamsCol, team.id);
        await deleteDoc(ref);
      });

      li.appendChild(left);
      li.appendChild(removeBtn);
      teamList.appendChild(li);
    });
  }

  renderTournamentTeamOptions();
}

teamForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = teamNameInput.value.trim();
  const shortName = teamShortInput.value.trim();

  if (!name) return;

  const newTeam = {
    id: crypto.randomUUID(),
    name,
    shortName: shortName || null
  };

  const ref = doc(teamsCol, newTeam.id);
  await setDoc(ref, newTeam);

  teamNameInput.value = "";
  teamShortInput.value = "";
  teamNameInput.focus();
});

// =======================
//   UI: TURNIERE
// =======================

const tournamentForm = document.getElementById("tournament-form");
const tournamentNameInput = document.getElementById("tournament-name");
const tournamentTypeSelect = document.getElementById("tournament-type");
const tournamentList = document.getElementById("tournament-list");

const worldcupSettings = document.getElementById("worldcup-settings");
const worldcupGroupCountInput = document.getElementById("worldcup-group-count");

const tournamentDetailSection = document.getElementById("tournament-detail");
const tournamentDetailTitle = document.getElementById("tournament-detail-title");
const tournamentDetailInfo = document.getElementById("tournament-detail-info");
const matchForm = document.getElementById("match-form");
const matchRoundInput = document.getElementById("match-round");
const matchHomeSelect = document.getElementById("match-home");
const matchAwaySelect = document.getElementById("match-away");
const matchList = document.getElementById("match-list");
const standingsWrapper = document.getElementById("standings-wrapper");

const generateKoBtn = document.getElementById("btn-generate-ko");
const deleteTournamentBtn = document.getElementById("btn-delete-tournament");

// nur zur Sicherheit: prüfen, ob der Button überhaupt gefunden wird
if (!deleteTournamentBtn) {
  console.warn("btn-delete-tournament nicht gefunden – prüfe index.html-ID");
}

tournamentTypeSelect.addEventListener("change", () => {
  if (tournamentTypeSelect.value === "worldcup") {
    worldcupSettings.classList.remove("hidden");
  } else {
    worldcupSettings.classList.add("hidden");
  }
});

function renderTournaments() {
  tournamentList.innerHTML = "";

  if (tournaments.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Noch keine Turniere angelegt.";
    tournamentList.appendChild(li);
    tournamentDetailSection.classList.add("hidden");
    return;
  }

  tournaments.forEach((tournament) => {
    const li = document.createElement("li");
    li.className = "tournament-item";

    const text = document.createElement("span");
    let typeLabel = tournament.type;
    if (tournament.type === "league") typeLabel = "Liga";
    if (tournament.type === "worldcup") typeLabel = "WM";

    text.textContent = `${tournament.name} (${typeLabel})`;

    const openBtn = document.createElement("button");
    openBtn.textContent = "Öffnen";
    openBtn.addEventListener("click", () => {
      selectedTournamentId = tournament.id;
      renderTournamentDetail();
    });

    li.appendChild(text);
    li.appendChild(openBtn);
    tournamentList.appendChild(li);
  });

  if (!selectedTournamentId && tournaments.length > 0) {
    selectedTournamentId = tournaments[0].id;
  }
  renderTournamentDetail();
}

function getSelectedTournament() {
  if (!selectedTournamentId) return null;
  return tournaments.find((t) => t.id === selectedTournamentId) || null;
}

function renderMatchSelectOptions(tournament) {
  matchHomeSelect.innerHTML = "";
  matchAwaySelect.innerHTML = "";

  tournament.teamIds.forEach((teamId) => {
    const team = getTeamById(teamId);
    if (!team) return;

    const optHome = document.createElement("option");
    optHome.value = team.id;
    optHome.textContent = team.name;

    const optAway = document.createElement("option");
    optAway.value = team.id;
    optAway.textContent = team.name;

    matchHomeSelect.appendChild(optHome);
    matchAwaySelect.appendChild(optAway);
  });

  if (matchHomeSelect.options.length > 1) {
    matchAwaySelect.selectedIndex = 1;
  }
}

function renderStandings(tournament) {
  standingsWrapper.innerHTML = "";

  const allMatches = tournament.matches || [];

  if (tournament.type === "worldcup" && Array.isArray(tournament.groups) && tournament.groups.length > 0) {
    tournament.groups.forEach((group) => {
      const groupMatches = allMatches.filter(
        (m) => m.stage === "group" && m.groupName === group.name
      );

      const stats = computeStandingsForTeams(group.teamIds, groupMatches);

      const title = document.createElement("div");
      title.className = "group-standings-title";
      title.textContent = `Gruppe ${group.name}`;
      standingsWrapper.appendChild(title);

      const table = document.createElement("table");
      table.className = "standings-table";

      const thead = document.createElement("thead");
      thead.innerHTML = `
        <tr>
          <th>Platz</th>
          <th>Team</th>
          <th>Punkte</th>
          <th>Siege</th>
          <th>Unentsch.</th>
          <th>Niederl.</th>
          <th>Tore</th>
          <th>Gegentore</th>
          <th>Diff.</th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      stats.forEach((s, index) => {
        const tr = document.createElement("tr");
        const diff = s.goalsFor - s.goalsAgainst;

        tr.innerHTML = `
          <td>${index + 1}</td>
          <td class="team-cell">${getTeamName(s.teamId)}</td>
          <td>${s.points}</td>
          <td>${s.wins}</td>
          <td>${s.draws}</td>
          <td>${s.losses}</td>
          <td>${s.goalsFor}</td>
          <td>${s.goalsAgainst}</td>
          <td>${diff}</td>
        `;

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      standingsWrapper.appendChild(table);
    });
  } else {
    const stats = computeStandingsForTeams(tournament.teamIds, allMatches);

    const table = document.createElement("table");
    table.className = "standings-table";

    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Platz</th>
        <th>Team</th>
        <th>Punkte</th>
        <th>Siege</th>
        <th>Unentsch.</th>
        <th>Niederl.</th>
        <th>Tore</th>
        <th>Gegentore</th>
        <th>Diff.</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    stats.forEach((s, index) => {
      const tr = document.createElement("tr");
      const diff = s.goalsFor - s.goalsAgainst;

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td class="team-cell">${getTeamName(s.teamId)}</td>
        <td>${s.points}</td>
        <td>${s.wins}</td>
        <td>${s.draws}</td>
        <td>${s.losses}</td>
        <td>${s.goalsFor}</td>
        <td>${s.goalsAgainst}</td>
        <td>${diff}</td>
      `;

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    standingsWrapper.appendChild(table);
  }
}

function renderMatchList(tournament) {
  matchList.innerHTML = "";

  if (!tournament.matches || tournament.matches.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Noch keine Matches angelegt.";
    matchList.appendChild(li);
  } else {
    const sortedMatches = [...tournament.matches].sort(
      (a, b) => (a.round || 0) - (b.round || 0)
    );

    sortedMatches.forEach((match) => {
      const li = document.createElement("li");
      li.className = "match-item";

      const info = document.createElement("span");
      const roundText = match.round ? `Runde ${match.round}: ` : "";

      let stageText = "";
      if (match.stage === "group" && match.groupName) {
        stageText = `Gruppe ${match.groupName} – `;
      } else if (match.stage === "knockout") {
        stageText = `K.o.-Runde${match.knockoutRound ? " " + match.knockoutRound : ""} – `;
      }

      const scoreText =
        match.homeGoals != null && match.awayGoals != null
          ? ` – Ergebnis: ${match.homeGoals}:${match.awayGoals}`
          : " – (noch kein Ergebnis)";

      info.textContent = `${roundText}${stageText}${getTeamName(
        match.homeTeamId
      )} vs. ${getTeamName(match.awayTeamId)}${scoreText}`;

      const resultBtn = document.createElement("button");
      resultBtn.textContent = "Ergebnis";
      resultBtn.addEventListener("click", async () => {
        const homeGoalsStr = prompt(
          "Tore Heimteam:",
          match.homeGoals != null ? match.homeGoals : ""
        );
        if (homeGoalsStr === null) return;
        const awayGoalsStr = prompt(
          "Tore Auswärtsteam:",
          match.awayGoals != null ? match.awayGoals : ""
        );
        if (awayGoalsStr === null) return;

        const homeGoals = parseInt(homeGoalsStr, 10);
        const awayGoals = parseInt(awayGoalsStr, 10);

        if (Number.isNaN(homeGoals) || Number.isNaN(awayGoals)) {
          alert("Bitte gültige Zahlen eingeben.");
          return;
        }

        match.homeGoals = homeGoals;
        match.awayGoals = awayGoals;
        await saveTournament(tournament);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Löschen";
      deleteBtn.addEventListener("click", async () => {
        tournament.matches = tournament.matches.filter((m) => m.id !== match.id);
        await saveTournament(tournament);
      });

      li.appendChild(info);
      li.appendChild(resultBtn);
      li.appendChild(deleteBtn);
      matchList.appendChild(li);
    });
  }

  renderStandings(tournament);
}

function renderTournamentDetail() {
  const tournament = getSelectedTournament();

  if (!tournament) {
    tournamentDetailSection.classList.add("hidden");
    return;
  }

  tournamentDetailSection.classList.remove("hidden");

  if (tournament.type === "worldcup") {
    generateKoBtn.classList.remove("hidden");
  } else {
    generateKoBtn.classList.add("hidden");
  }

  tournamentDetailTitle.textContent = tournament.name;
  const teamNames = tournament.teamIds.map((id) => getTeamName(id)).join(", ");

  let typeText = tournament.type;
  if (tournament.type === "league") typeText = "Liga";
  if (tournament.type === "worldcup") typeText = "WM";

  tournamentDetailInfo.textContent = `${typeText} mit Teams: ${teamNames}`;

  renderMatchSelectOptions(tournament);
  renderMatchList(tournament);
}

tournamentForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = tournamentNameInput.value.trim();
  if (!name) return;

  const type = tournamentTypeSelect.value;

  const checkboxes = tournamentTeamOptionsDiv.querySelectorAll("input[type=checkbox]");
  const selectedTeamIds = [];
  checkboxes.forEach((cb) => {
    if (cb.checked) selectedTeamIds.push(cb.value);
  });

  if (selectedTeamIds.length < 2) {
    alert("Bitte mindestens zwei Teams auswählen.");
    return;
  }

  const scheduleMode = (
    tournamentForm.querySelector('input[name="schedule-mode"]:checked') || {}
  ).value;

  const newTournament = {
    id: crypto.randomUUID(),
    name,
    type,
    teamIds: selectedTeamIds,
    matches: []
  };

  if (type === "league" && scheduleMode === "auto") {
    newTournament.matches = generateLeagueSchedule(selectedTeamIds);
  }

  if (type === "worldcup") {
    const groupCountRaw = parseInt(worldcupGroupCountInput.value, 10);
    let groupCount = Number.isNaN(groupCountRaw) ? 1 : groupCountRaw;
    groupCount = Math.max(1, Math.min(groupCount, selectedTeamIds.length));

    const groupTeamIds = Array.from({ length: groupCount }, () => []);
    selectedTeamIds.forEach((teamId, index) => {
      const gIndex = index % groupCount;
      groupTeamIds[gIndex].push(teamId);
    });

    const groups = groupTeamIds.map((ids, index) => ({
      name: String.fromCharCode(65 + index),
      teamIds: ids
    }));

    newTournament.groups = groups;

    if (scheduleMode === "auto") {
      const allGroupMatches = [];
      groups.forEach((group) => {
        const gm = generateLeagueSchedule(group.teamIds).map((m) => ({
          ...m,
          stage: "group",
          groupName: group.name
        }));
        allGroupMatches.push(...gm);
      });
      newTournament.matches = allGroupMatches;
    }
  }

  const ref = doc(tournamentsCol, newTournament.id);
  await setDoc(ref, newTournament);

  tournamentNameInput.value = "";
  checkboxes.forEach((cb) => (cb.checked = false));

  selectedTournamentId = newTournament.id;
});

// Turnier löschen – mit sichtbarem Feedback
if (deleteTournamentBtn) {
  deleteTournamentBtn.addEventListener("click", async () => {
    const tournament = getSelectedTournament();
    if (!tournament) {
      alert("Kein Turnier ausgewählt.");
      return;
    }

    const ok = confirm(`Turnier "${tournament.name}" wirklich löschen?`);
    if (!ok) return;

    try {
      const ref = doc(tournamentsCol, tournament.id);
      await deleteDoc(ref);
      alert(`Turnier "${tournament.name}" wurde gelöscht.`);
      // selectedTournamentId zurücksetzen – Snapshot kümmert sich um UI
      selectedTournamentId = null;
    } catch (err) {
      console.error("Fehler beim Löschen des Turniers:", err);
      alert("Fehler beim Löschen des Turniers (siehe Konsole).");
    }
  });
}

// Match manuell hinzufügen
matchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tournament = getSelectedTournament();
  if (!tournament) return;

  const round = parseInt(matchRoundInput.value, 10) || null;
  const homeTeamId = matchHomeSelect.value;
  const awayTeamId = matchAwaySelect.value;

  if (!homeTeamId || !awayTeamId) {
    alert("Bitte Heim- und Auswärtsteam auswählen.");
    return;
  }

  if (homeTeamId === awayTeamId) {
    alert("Heim- und Auswärtsteam müssen unterschiedlich sein.");
    return;
  }

  const newMatch = {
    id: crypto.randomUUID(),
    round,
    homeTeamId,
    awayTeamId,
    homeGoals: null,
    awayGoals: null,
    stage: tournament.type === "worldcup" ? "knockout" : "league",
    groupName: null,
    knockoutRound: null
  };

  tournament.matches = tournament.matches || [];
  tournament.matches.push(newMatch);
  await saveTournament(tournament);
});

// =======================
//   K.O.-PHASE GENERIEREN
// =======================

async function generateKnockoutFromGroups(tournament) {
  if (tournament.type !== "worldcup" || !Array.isArray(tournament.groups)) {
    alert("K.o.-Phase ist nur für WM-Turniere mit Gruppen verfügbar.");
    return;
  }

  const allMatches = tournament.matches || [];

  const groupStandings = new Map();

  tournament.groups.forEach((group) => {
    const groupMatches = allMatches.filter(
      (m) => m.stage === "group" && m.groupName === group.name
    );
    const stats = computeStandingsForTeams(group.teamIds, groupMatches);
    groupStandings.set(group.name, stats);
  });

  const qualified = [];

  tournament.groups
    .map((g) => g.name)
    .sort()
    .forEach((gName) => {
      const stats = groupStandings.get(gName) || [];
      if (stats[0]) {
        qualified.push({ group: gName, pos: 1, teamId: stats[0].teamId });
      }
      if (stats[1]) {
        qualified.push({ group: gName, pos: 2, teamId: stats[1].teamId });
      }
    });

  if (qualified.length < 2) {
    alert("Es sind nicht genug Teams für eine K.o.-Phase qualifiziert.");
    return;
  }

  const teamCount = qualified.length;
  const roundName = getKnockoutRoundName(teamCount);

  tournament.matches = (tournament.matches || []).filter(
    (m) => m.stage !== "knockout"
  );

  const newKoMatches = [];
  const groupNamesSorted = tournament.groups.map((g) => g.name).sort();

  for (let i = 0; i + 1 < groupNamesSorted.length; i += 2) {
    const gA = groupNamesSorted[i];
    const gB = groupNamesSorted[i + 1];

    const gA1 = qualified.find((q) => q.group === gA && q.pos === 1);
    const gA2 = qualified.find((q) => q.group === gA && q.pos === 2);
    const gB1 = qualified.find((q) => q.group === gB && q.pos === 1);
    const gB2 = qualified.find((q) => q.group === gB && q.pos === 2);

    if (gA1 && gB2) {
      newKoMatches.push({
        id: crypto.randomUUID(),
        round: null,
        homeTeamId: gA1.teamId,
        awayTeamId: gB2.teamId,
        homeGoals: null,
        awayGoals: null,
        stage: "knockout",
        groupName: null,
        knockoutRound: roundName
      });
    }

    if (gB1 && gA2) {
      newKoMatches.push({
        id: crypto.randomUUID(),
        round: null,
        homeTeamId: gB1.teamId,
        awayTeamId: gA2.teamId,
        homeGoals: null,
        awayGoals: null,
        stage: "knockout",
        groupName: null,
        knockoutRound: roundName
      });
    }
  }

  if (newKoMatches.length === 0) {
    alert("Es konnten keine K.o.-Spiele erzeugt werden.");
    return;
  }

  tournament.matches.push(...newKoMatches);
  await saveTournament(tournament);
}

generateKoBtn.addEventListener("click", async () => {
  const tournament = getSelectedTournament();
  if (!tournament) return;

  if (
    !confirm(
      "K.o.-Phase neu aus den aktuellen Gruppentabellen erzeugen?\n" +
        "Vorhandene K.o.-Spiele werden dabei gelöscht."
    )
  ) {
    return;
  }

  await generateKnockoutFromGroups(tournament);
});

// =======================
//   NAVIGATION
// =======================

const viewTeams = document.getElementById("view-teams");
const viewTournaments = document.getElementById("view-tournaments");
const navTeamsBtn = document.getElementById("nav-teams");
const navTournamentsBtn = document.getElementById("nav-tournaments");

navTeamsBtn.addEventListener("click", () => {
  viewTeams.classList.remove("hidden");
  viewTournaments.classList.add("hidden");
  navTeamsBtn.classList.add("active");
  navTournamentsBtn.classList.remove("active");
});

navTournamentsBtn.addEventListener("click", () => {
  viewTeams.classList.add("hidden");
  viewTournaments.classList.remove("hidden");
  navTeamsBtn.classList.remove("active");
  navTournamentsBtn.classList.add("active");
});

// =======================
//   Firebase-Live-Updates
// =======================

function subscribeToFirebase() {
  onSnapshot(teamsCol, (snapshot) => {
    teams = snapshot.docs.map((d) => d.data());
    renderTeams();
  });

  onSnapshot(tournamentsCol, (snapshot) => {
    const oldSelected = selectedTournamentId;
    tournaments = snapshot.docs.map((d) => d.data());

    if (!tournaments.find((t) => t.id === oldSelected)) {
      selectedTournamentId = tournaments[0]?.id || null;
    }

    renderTournaments();
  });
}

subscribeToFirebase();
