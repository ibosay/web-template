// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Haptics, NotificationType } from '@capacitor/haptics';
import './QuizArenaLive.css';

type Question = { id: number; category: string; question: string; answers: string[]; correct: number; };
type LocalizedQuestion = { question: string; answers: string[] };
type QuestionLocale = 'DE'|'EN';

type Progress = {
  xp: number;
  rounds: number;
  correct: number;
  bestStreak: number;
};

export const QUESTIONS: Question[] = [
  {
    id: 1,
    category: 'Geografie',
    question: 'Was ist die Hauptstadt von Kanada?',
    answers: ['Toronto', 'Ottawa', 'Vancouver', 'Montreal'],
    correct: 1,
  },
  {
    id: 2,
    category: 'Geografie',
    question: 'Welcher Fluss fließt durch Wien?',
    answers: ['Rhein', 'Elbe', 'Donau', 'Main'],
    correct: 2,
  },
  {
    id: 3,
    category: 'Geografie',
    question: 'Welcher Kontinent ist flächenmäßig der größte?',
    answers: ['Afrika', 'Asien', 'Europa', 'Südamerika'],
    correct: 1,
  },
  {
    id: 4,
    category: 'Wissenschaft',
    question: 'Welches chemische Symbol hat Gold?',
    answers: ['Ag', 'Au', 'Gd', 'Go'],
    correct: 1,
  },
  {
    id: 5,
    category: 'Wissenschaft',
    question: 'Wie viele Planeten hat unser Sonnensystem?',
    answers: ['7', '8', '9', '10'],
    correct: 1,
  },
  {
    id: 6,
    category: 'Wissenschaft',
    question: 'Welche Einheit misst elektrische Spannung?',
    answers: ['Watt', 'Volt', 'Ampere', 'Ohm'],
    correct: 1,
  },
  {
    id: 7,
    category: 'Kultur',
    question: 'Wer malte die Mona Lisa?',
    answers: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Rembrandt'],
    correct: 2,
  },
  {
    id: 8,
    category: 'Kultur',
    question: 'In welcher Stadt steht das Kolosseum?',
    answers: ['Athen', 'Rom', 'Madrid', 'Paris'],
    correct: 1,
  },
  {
    id: 9,
    category: 'Kultur',
    question: 'Wie heißt die japanische Papierfaltkunst?',
    answers: ['Ikebana', 'Origami', 'Haiku', 'Kabuki'],
    correct: 1,
  },
  {
    id: 10,
    category: 'Geschichte',
    question: 'In welchem Jahr fiel die Berliner Mauer?',
    answers: ['1987', '1989', '1991', '1993'],
    correct: 1,
  },
  {
    id: 11,
    category: 'Geschichte',
    question: 'Welches Reich baute Machu Picchu?',
    answers: ['Azteken', 'Maya', 'Inka', 'Römer'],
    correct: 2,
  },
  {
    id: 12,
    category: 'Geschichte',
    question: 'Wer war der erste Mensch auf dem Mond?',
    answers: ['Buzz Aldrin', 'Neil Armstrong', 'Juri Gagarin', 'John Glenn'],
    correct: 1,
  },
  {
    id: 13,
    category: 'Islam',
    question: 'Wie viele Säulen hat der Islam?',
    answers: ['Drei', 'Vier', 'Fünf', 'Sechs'],
    correct: 2,
  },
  {
    id: 14,
    category: 'Islam',
    question: 'Wie heißt das Pflichtgebet vor Sonnenaufgang?',
    answers: ['Fajr', 'Dhuhr', 'Asr', 'Isha'],
    correct: 0,
  },
  {
    id: 15,
    category: 'Islam',
    question: 'In welchem Monat fasten Muslime von der Morgendämmerung bis zum Sonnenuntergang?',
    answers: ['Muharram', 'Rajab', 'Ramadan', 'Shawwal'],
    correct: 2,
  },
  {
    id: 16,
    category: 'Islam',
    question: 'In welche Richtung wenden sich Muslime beim Pflichtgebet?',
    answers: ['Nach Medina', 'Zur Kaaba in Mekka', 'Nach Jerusalem', 'Nach Norden'],
    correct: 1,
  },
  {
    id: 17,
    category: 'Islam',
    question: 'Wie viele Pflichtgebete gibt es täglich?',
    answers: ['Drei', 'Vier', 'Fünf', 'Sechs'],
    correct: 2,
  },
  {
    id: 18,
    category: 'Islam',
    question: 'Wie heißt die verpflichtende Abgabe auf bestimmtes Vermögen, wenn ihre Voraussetzungen erfüllt sind?',
    answers: ['Sadaqa', 'Zakat', 'Fidya', 'Waqf'],
    correct: 1,
  },
  {
    id: 19,
    category: 'Islam',
    question: 'Wer ist der letzte Prophet?',
    answers: ['Ibrahim', 'Musa', 'Isa', 'Muhammad'],
    correct: 3,
  },
  {
    id: 20,
    category: 'Islam',
    question: 'Wie heißt die Pilgerfahrt nach Mekka, die zu den fünf Säulen des Islam gehört?',
    answers: ['Umra', 'Haddsch', 'Hijra', 'Itikaf'],
    correct: 1,
  },

  { id: 21, category: 'Geografie', question: 'Welches Land hat die größte Fläche der Erde?', answers: ['Kanada', 'China', 'Russland', 'USA'], correct: 2 },
  { id: 22, category: 'Geografie', question: 'Welches Gebirge trennt große Teile Europas und Asiens?', answers: ['Alpen', 'Ural', 'Anden', 'Karpaten'], correct: 1 },
  { id: 23, category: 'Geografie', question: 'Welche Hauptstadt liegt an der Themse?', answers: ['Dublin', 'London', 'Amsterdam', 'Brüssel'], correct: 1 },
  { id: 24, category: 'Geografie', question: 'Zu welchem Land gehört die Insel Sizilien?', answers: ['Spanien', 'Griechenland', 'Italien', 'Portugal'], correct: 2 },
  { id: 25, category: 'Geografie', question: 'Welcher Ozean liegt zwischen Afrika und Australien?', answers: ['Atlantik', 'Pazifik', 'Indischer Ozean', 'Arktischer Ozean'], correct: 2 },
  { id: 26, category: 'Geografie', question: 'Welche Stadt ist die Hauptstadt Australiens?', answers: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correct: 2 },
  { id: 27, category: 'Geografie', question: 'Welches Land grenzt sowohl an Deutschland als auch an Italien?', answers: ['Belgien', 'Österreich', 'Dänemark', 'Polen'], correct: 1 },
  { id: 28, category: 'Geografie', question: 'Auf welchem Kontinent liegt die Sahara?', answers: ['Asien', 'Afrika', 'Südamerika', 'Australien'], correct: 1 },
  { id: 29, category: 'Geografie', question: 'Welche Hauptstadt gehört zu Japan?', answers: ['Seoul', 'Peking', 'Tokio', 'Bangkok'], correct: 2 },
  { id: 30, category: 'Geografie', question: 'Welches Meer liegt zwischen Europa und Afrika?', answers: ['Nordsee', 'Mittelmeer', 'Ostsee', 'Schwarzes Meer'], correct: 1 },
  { id: 31, category: 'Geografie', question: 'Welches Land hat die Form eines Stiefels?', answers: ['Italien', 'Kroatien', 'Portugal', 'Albanien'], correct: 0 },
  { id: 32, category: 'Geografie', question: 'Welche Hauptstadt gehört zur Türkei?', answers: ['Istanbul', 'Ankara', 'Izmir', 'Bursa'], correct: 1 },
  { id: 33, category: 'Geografie', question: 'Welcher Kontinent liegt am Südpol?', answers: ['Antarktika', 'Europa', 'Asien', 'Afrika'], correct: 0 },
  { id: 34, category: 'Geografie', question: 'Welcher Fluss fließt durch Paris?', answers: ['Seine', 'Donau', 'Themse', 'Tiber'], correct: 0 },
  { id: 35, category: 'Geografie', question: 'Welche Hauptstadt gehört zu Ägypten?', answers: ['Kairo', 'Rabat', 'Tunis', 'Amman'], correct: 0 },
  { id: 36, category: 'Geografie', question: 'Welches Land liegt westlich von Spanien auf der Iberischen Halbinsel?', answers: ['Portugal', 'Frankreich', 'Italien', 'Marokko'], correct: 0 },
  { id: 37, category: 'Geografie', question: 'Welche Insel ist die größte der Welt?', answers: ['Madagaskar', 'Grönland', 'Borneo', 'Island'], correct: 1 },

  { id: 38, category: 'Wissenschaft', question: 'Welcher Planet ist der Sonne am nächsten?', answers: ['Venus', 'Mars', 'Merkur', 'Erde'], correct: 2 },
  { id: 39, category: 'Wissenschaft', question: 'Welches Gas benötigen Menschen hauptsächlich zum Atmen?', answers: ['Stickstoff', 'Sauerstoff', 'Helium', 'Wasserstoff'], correct: 1 },
  { id: 40, category: 'Wissenschaft', question: 'Wie nennt man den Übergang von flüssigem Wasser zu Wasserdampf?', answers: ['Gefrieren', 'Verdampfen', 'Kondensieren', 'Schmelzen'], correct: 1 },
  { id: 41, category: 'Wissenschaft', question: 'Welches Organ pumpt Blut durch den menschlichen Körper?', answers: ['Leber', 'Lunge', 'Herz', 'Niere'], correct: 2 },
  { id: 42, category: 'Wissenschaft', question: 'Wie viele Knochen hat ein erwachsener Mensch typischerweise?', answers: ['106', '206', '306', '406'], correct: 1 },
  { id: 43, category: 'Wissenschaft', question: 'Welche Kraft zieht Gegenstände zur Erde?', answers: ['Magnetismus', 'Gravitation', 'Reibung', 'Auftrieb'], correct: 1 },
  { id: 44, category: 'Wissenschaft', question: 'Welcher Planet ist für sein auffälliges Ringsystem bekannt?', answers: ['Mars', 'Saturn', 'Merkur', 'Venus'], correct: 1 },
  { id: 45, category: 'Wissenschaft', question: 'Was ist H2O?', answers: ['Sauerstoff', 'Salz', 'Wasser', 'Wasserstoff'], correct: 2 },
  { id: 46, category: 'Wissenschaft', question: 'Welches Blutgefäß führt Blut grundsätzlich vom Herzen weg?', answers: ['Arterie', 'Vene', 'Kapillare', 'Lymphgefäß'], correct: 0 },
  { id: 47, category: 'Wissenschaft', question: 'Welche Einheit wird für elektrische Stromstärke verwendet?', answers: ['Volt', 'Ampere', 'Watt', 'Joule'], correct: 1 },
  { id: 48, category: 'Wissenschaft', question: 'Was beschreibt die DNA hauptsächlich?', answers: ['Erbinformation', 'Körpertemperatur', 'Blutdruck', 'Verdauung'], correct: 0 },
  { id: 49, category: 'Wissenschaft', question: 'Welches Tier gehört zu den Säugetieren?', answers: ['Hai', 'Delfin', 'Forelle', 'Krake'], correct: 1 },
  { id: 50, category: 'Wissenschaft', question: 'Wie heißt der Prozess, mit dem Pflanzen Lichtenergie nutzen?', answers: ['Photosynthese', 'Gärung', 'Destillation', 'Osmose'], correct: 0 },
  { id: 51, category: 'Wissenschaft', question: 'Welches Metall ist bei Raumtemperatur flüssig?', answers: ['Eisen', 'Quecksilber', 'Kupfer', 'Aluminium'], correct: 1 },
  { id: 52, category: 'Wissenschaft', question: 'Wie viele Chromosomen besitzt eine normale menschliche Körperzelle?', answers: ['23', '46', '44', '92'], correct: 1 },
  { id: 53, category: 'Wissenschaft', question: 'Welche Schicht schützt die Erde vor einem großen Teil der UV-Strahlung?', answers: ['Ozonschicht', 'Erdkern', 'Troposphäre allein', 'Magnetkern'], correct: 0 },
  { id: 54, category: 'Wissenschaft', question: 'Wie heißt das Zentrum eines Atoms?', answers: ['Elektron', 'Atomkern', 'Molekül', 'Ion'], correct: 1 },

  { id: 55, category: 'Kultur', question: 'Wer schrieb das Drama Romeo und Julia?', answers: ['Goethe', 'Shakespeare', 'Schiller', 'Dante'], correct: 1 },
  { id: 56, category: 'Kultur', question: 'Welches Instrument besitzt typischerweise 88 Tasten?', answers: ['Klavier', 'Violine', 'Trompete', 'Flöte'], correct: 0 },
  { id: 57, category: 'Kultur', question: 'Aus welchem Land stammt die Kunstform Kabuki?', answers: ['China', 'Japan', 'Indien', 'Korea'], correct: 1 },
  { id: 58, category: 'Kultur', question: 'Wer komponierte die 9. Sinfonie mit der Ode an die Freude?', answers: ['Mozart', 'Beethoven', 'Bach', 'Vivaldi'], correct: 1 },
  { id: 59, category: 'Kultur', question: 'Wie nennt man ein Gedicht mit traditionell 14 Verszeilen?', answers: ['Sonett', 'Roman', 'Essay', 'Fabel'], correct: 0 },
  { id: 60, category: 'Kultur', question: 'Welcher Künstler malte Die Sternennacht?', answers: ['Van Gogh', 'Picasso', 'Monet', 'Dalí'], correct: 0 },
  { id: 61, category: 'Kultur', question: 'In welchem Land entstand der Flamenco?', answers: ['Spanien', 'Frankreich', 'Mexiko', 'Portugal'], correct: 0 },
  { id: 62, category: 'Kultur', question: 'Wie heißt die Kunst des schönen Schreibens?', answers: ['Kalligrafie', 'Lithografie', 'Fotografie', 'Choreografie'], correct: 0 },
  { id: 63, category: 'Kultur', question: 'Wer schrieb den Roman Der Prozess?', answers: ['Franz Kafka', 'Thomas Mann', 'Hermann Hesse', 'Stefan Zweig'], correct: 0 },
  { id: 64, category: 'Kultur', question: 'Welche Tanzform ist eng mit Argentinien verbunden?', answers: ['Tango', 'Walzer', 'Polka', 'Samba'], correct: 0 },
  { id: 65, category: 'Kultur', question: 'Welcher Maler ist für das Werk Guernica bekannt?', answers: ['Picasso', 'Rembrandt', 'Klimt', 'Munch'], correct: 0 },
  { id: 66, category: 'Kultur', question: 'Wie nennt man eine längere erfundene Erzählung in Buchform?', answers: ['Roman', 'Sonett', 'Oper', 'Skulptur'], correct: 0 },
  { id: 67, category: 'Kultur', question: 'Welcher österreichische Komponist wurde in Salzburg geboren?', answers: ['Mozart', 'Beethoven', 'Brahms', 'Wagner'], correct: 0 },
  { id: 68, category: 'Kultur', question: 'Welche Kunstform arbeitet hauptsächlich mit dreidimensionalen Figuren und Formen?', answers: ['Skulptur', 'Lyrik', 'Oper', 'Fotografie'], correct: 0 },
  { id: 69, category: 'Kultur', question: 'Wie heißt das berühmte Museum in Paris, in dem die Mona Lisa ausgestellt ist?', answers: ['Louvre', 'Prado', 'Uffizien', 'Tate Modern'], correct: 0 },
  { id: 70, category: 'Kultur', question: 'Welcher Autor schrieb Die Verwandlung?', answers: ['Franz Kafka', 'Bertolt Brecht', 'Heinrich Heine', 'Erich Kästner'], correct: 0 },
  { id: 71, category: 'Kultur', question: 'Welche Farbe entsteht klassisch beim Mischen von Blau und Gelb?', answers: ['Grün', 'Orange', 'Violett', 'Rot'], correct: 0 },

  { id: 72, category: 'Geschichte', question: 'Welche antike Stadt wurde beim Ausbruch des Vesuvs im Jahr 79 verschüttet?', answers: ['Pompeji', 'Sparta', 'Troja', 'Alexandria'], correct: 0 },
  { id: 73, category: 'Geschichte', question: 'Wer erfand in Europa den Buchdruck mit beweglichen Metalllettern?', answers: ['Johannes Gutenberg', 'Galileo Galilei', 'Isaac Newton', 'James Watt'], correct: 0 },
  { id: 74, category: 'Geschichte', question: 'In welchem Jahr begann der Erste Weltkrieg?', answers: ['1912', '1914', '1916', '1918'], correct: 1 },
  { id: 75, category: 'Geschichte', question: 'Welche Zivilisation errichtete die großen Pyramiden von Gizeh?', answers: ['Altes Ägypten', 'Römisches Reich', 'Inka', 'Wikinger'], correct: 0 },
  { id: 76, category: 'Geschichte', question: 'Wer war der erste Präsident der Vereinigten Staaten?', answers: ['George Washington', 'Abraham Lincoln', 'Thomas Jefferson', 'John Adams'], correct: 0 },
  { id: 77, category: 'Geschichte', question: 'Welche Stadt war das Zentrum des Byzantinischen Reiches?', answers: ['Konstantinopel', 'Paris', 'Madrid', 'Wien'], correct: 0 },
  { id: 78, category: 'Geschichte', question: 'Welches Volk ist besonders mit Langschiffen und Fahrten aus Skandinavien verbunden?', answers: ['Wikinger', 'Azteken', 'Perser', 'Phönizier'], correct: 0 },
  { id: 79, category: 'Geschichte', question: 'Welche Revolution begann 1789?', answers: ['Französische Revolution', 'Industrielle Revolution', 'Russische Revolution', 'Amerikanischer Bürgerkrieg'], correct: 0 },
  { id: 80, category: 'Geschichte', question: 'Wer war als makedonischer Eroberer Alexander der Große bekannt?', answers: ['Alexander III. von Makedonien', 'Julius Caesar', 'Hannibal', 'Perikles'], correct: 0 },
  { id: 81, category: 'Geschichte', question: 'Welche antike Zivilisation entwickelte sich rund um Athen und Sparta?', answers: ['Griechen', 'Maya', 'Inka', 'Kelten'], correct: 0 },
  { id: 82, category: 'Geschichte', question: 'In welchem Jahr endete der Zweite Weltkrieg in Europa?', answers: ['1943', '1944', '1945', '1946'], correct: 2 },
  { id: 83, category: 'Geschichte', question: 'Welche historische Handelsroute verband Ostasien mit Regionen bis nach Europa?', answers: ['Seidenstraße', 'Bernsteinstraße', 'Route 66', 'Panamericana'], correct: 0 },
  { id: 84, category: 'Geschichte', question: 'Welches Reich hatte Rom als Hauptstadt?', answers: ['Römisches Reich', 'Osmanisches Reich', 'Mogulreich', 'Aztekenreich'], correct: 0 },
  { id: 85, category: 'Geschichte', question: 'Wer erreichte 1492 im Auftrag der spanischen Krone die Karibik?', answers: ['Christoph Kolumbus', 'Marco Polo', 'James Cook', 'Vasco da Gama'], correct: 0 },
  { id: 86, category: 'Geschichte', question: 'Wie hieß die Epoche der europäischen Wiederentdeckung antiker Kunst und Wissenschaft?', answers: ['Renaissance', 'Bronzezeit', 'Romantik', 'Aufklärung'], correct: 0 },
  { id: 87, category: 'Geschichte', question: 'Welche Schrift verwendeten die alten Ägypter unter anderem auf Monumenten?', answers: ['Hieroglyphen', 'Keilschrift', 'Runen', 'Kyrillisch'], correct: 0 },
  { id: 88, category: 'Geschichte', question: 'Welcher Konflikt in den USA dauerte von 1861 bis 1865?', answers: ['Amerikanischer Bürgerkrieg', 'Siebenjähriger Krieg', 'Krimkrieg', 'Burenkrieg'], correct: 0 },

  { id: 89, category: 'Islam', question: 'Wie heißt das Glaubensbekenntnis und die erste Säule des Islam?', answers: ['Schahada', 'Zakat', 'Sawm', 'Haddsch'], correct: 0 },
  { id: 90, category: 'Islam', question: 'Welche Gebetswaschung wird üblicherweise vor dem Gebet vorgenommen?', answers: ['Wudu', 'Adhan', 'Khutba', 'Dhikr'], correct: 0 },
  { id: 91, category: 'Islam', question: 'Wie heißt der Gebetsruf im Islam?', answers: ['Adhan', 'Iqra', 'Tafsir', 'Suhur'], correct: 0 },
  { id: 92, category: 'Islam', question: 'Welche Sure steht am Anfang des Qurans?', answers: ['Al-Fatiha', 'Al-Baqara', 'Al-Ikhlas', 'An-Nas'], correct: 0 },
  { id: 93, category: 'Islam', question: 'Wie viele Suren enthält der Quran?', answers: ['99', '110', '114', '120'], correct: 2 },
  { id: 94, category: 'Islam', question: 'Wie heißt die Nacht, die im Quran als besser als tausend Monate beschrieben wird?', answers: ['Laylat al-Qadr', 'Laylat al-Miraj', 'Arafa', 'Ashura'], correct: 0 },
  { id: 95, category: 'Islam', question: 'Wie heißt die Mahlzeit vor Beginn des täglichen Fastens im Ramadan?', answers: ['Suhur', 'Iftar', 'Aqiqa', 'Walima'], correct: 0 },
  { id: 96, category: 'Islam', question: 'Wie heißt das Fastenbrechen nach Sonnenuntergang im Ramadan?', answers: ['Iftar', 'Suhur', 'Ihram', 'Tawaf'], correct: 0 },
  { id: 97, category: 'Islam', question: 'Welche Stadt ist das Ziel des Haddsch?', answers: ['Mekka', 'Medina', 'Jerusalem', 'Damaskus'], correct: 0 },
  { id: 98, category: 'Islam', question: 'Wie heißt das Umrunden der Kaaba während der Pilgerfahrt?', answers: ['Tawaf', 'Sajda', 'Ruku', 'Khutba'], correct: 0 },
  { id: 99, category: 'Islam', question: 'Zwischen welchen beiden Hügeln wird beim Haddsch und bei der Umra der Saʿy vollzogen?', answers: ['Safa und Marwa', 'Arafat und Mina', 'Uhud und Hira', 'Muzdalifa und Mina'], correct: 0 },
  { id: 100, category: 'Islam', question: 'Wie heißt die Auswanderung des Propheten Muhammad von Mekka nach Medina?', answers: ['Hidschra', 'Isra', 'Haddsch', 'Umra'], correct: 0 },
  { id: 101, category: 'Islam', question: 'Welcher Engel überbrachte die Offenbarung an den Propheten Muhammad?', answers: ['Jibril', 'Mikail', 'Israfil', 'Malik'], correct: 0 },
  { id: 102, category: 'Islam', question: 'Wie heißt die Niederwerfung im Gebet?', answers: ['Sujud', 'Ruku', 'Qiyam', 'Salam'], correct: 0 },
  { id: 103, category: 'Islam', question: 'Wie heißt die Verbeugung im Gebet?', answers: ['Ruku', 'Sujud', 'Adhan', 'Tawaf'], correct: 0 },
  { id: 104, category: 'Islam', question: 'Welcher Prophet baute zusammen mit seinem Sohn Ismail die Fundamente der Kaaba auf?', answers: ['Ibrahim', 'Musa', 'Nuh', 'Yusuf'], correct: 0 },
  { id: 105, category: 'Islam', question: 'Wie heißt der Vater des Propheten Yusuf?', answers: ['Yaqub', 'Ibrahim', 'Musa', 'Harun'], correct: 0 },
  { id: 106, category: 'Islam', question: 'Welcher Prophet wird mit der Arche und der großen Flut verbunden?', answers: ['Nuh', 'Yunus', 'Dawud', 'Sulayman'], correct: 0 },
  { id: 107, category: 'Islam', question: 'Welcher Prophet wurde von einem großen Fisch verschlungen?', answers: ['Yunus', 'Yusuf', 'Ayyub', 'Zakariya'], correct: 0 },
  { id: 108, category: 'Islam', question: 'Wie heißt das Freitagsgebet?', answers: ['Jumuʿa', 'Witr', 'Tarawih', 'Duha'], correct: 0 },
  { id: 109, category: 'Islam', question: 'Welche Gebetsrichtung wird Qibla genannt?', answers: ['Richtung zur Kaaba', 'Richtung nach Medina', 'Richtung nach Osten', 'Richtung zum nächsten Minarett'], correct: 0 },
  { id: 110, category: 'Islam', question: 'Wie heißt der Monat, in dem der Haddsch stattfindet?', answers: ['Dhu al-Hiddscha', 'Ramadan', 'Safar', 'Rajab'], correct: 0 },
  { id: 111, category: 'Österreich', question: 'Wie heißt die Bundeshauptstadt Österreichs?', answers: ['Graz', 'Wien', 'Salzburg', 'Linz'], correct: 1 },
  { id: 112, category: 'Österreich', question: 'Wie viele Bundesländer hat Österreich?', answers: ['7', '8', '9', '10'], correct: 2 },
  { id: 113, category: 'Österreich', question: 'Welches Bundesland ist flächenmäßig das größte?', answers: ['Tirol', 'Steiermark', 'Niederösterreich', 'Oberösterreich'], correct: 2 },
  { id: 114, category: 'Österreich', question: 'Welcher Fluss fließt durch Wien und Linz?', answers: ['Inn', 'Mur', 'Donau', 'Salzach'], correct: 2 },
  { id: 115, category: 'Österreich', question: 'Wie heißt der höchste Berg Österreichs?', answers: ['Dachstein', 'Großglockner', 'Wildspitze', 'Großvenediger'], correct: 1 },
  { id: 116, category: 'Österreich', question: 'Welches Bundesland hat Innsbruck als Landeshauptstadt?', answers: ['Vorarlberg', 'Tirol', 'Kärnten', 'Salzburg'], correct: 1 },
  { id: 117, category: 'Österreich', question: 'Welche Stadt ist die Landeshauptstadt der Steiermark?', answers: ['Graz', 'Klagenfurt', 'Eisenstadt', 'St. Pölten'], correct: 0 },
  { id: 118, category: 'Österreich', question: 'Welche Stadt ist die Landeshauptstadt von Niederösterreich?', answers: ['Wien', 'St. Pölten', 'Krems', 'Wiener Neustadt'], correct: 1 },
  { id: 119, category: 'Österreich', question: 'Welches Bundesland liegt ganz im Westen Österreichs?', answers: ['Vorarlberg', 'Burgenland', 'Wien', 'Kärnten'], correct: 0 },
  { id: 120, category: 'Österreich', question: 'Welche Währung verwendet Österreich?', answers: ['Franken', 'Euro', 'Krone', 'Schilling'], correct: 1 },
  { id: 121, category: 'Österreich', question: 'Seit welchem Jahr ist Österreich Mitglied der Europäischen Union?', answers: ['1989', '1995', '2002', '2007'], correct: 1 },
  { id: 122, category: 'Österreich', question: 'Welche Farben hat die österreichische Bundesflagge?', answers: ['Rot-Weiß-Rot', 'Schwarz-Rot-Gold', 'Rot-Weiß-Blau', 'Grün-Weiß-Grün'], correct: 0 },
  { id: 123, category: 'Österreich', question: 'Wie heißt die Landeshauptstadt von Kärnten?', answers: ['Villach', 'Klagenfurt', 'Bregenz', 'Lienz'], correct: 1 },
  { id: 124, category: 'Österreich', question: 'Wie heißt die Landeshauptstadt des Burgenlands?', answers: ['Eisenstadt', 'Rust', 'Mattersburg', 'Oberwart'], correct: 0 },
  { id: 125, category: 'Österreich', question: 'Welche Stadt ist die Landeshauptstadt von Vorarlberg?', answers: ['Dornbirn', 'Feldkirch', 'Bregenz', 'Bludenz'], correct: 2 },
  { id: 126, category: 'Österreich', question: 'Welcher berühmte Komponist wurde 1756 in Salzburg geboren?', answers: ['Mozart', 'Beethoven', 'Haydn', 'Schubert'], correct: 0 },
  { id: 127, category: 'Österreich', question: 'Wie heißt das bekannte Schloss in Wien, das als Sommerresidenz der Habsburger diente?', answers: ['Belvedere', 'Schönbrunn', 'Hofburg', 'Mirabell'], correct: 1 },
  { id: 128, category: 'Österreich', question: 'Welcher See liegt teilweise in Österreich und teilweise in Ungarn?', answers: ['Wörthersee', 'Neusiedler See', 'Attersee', 'Traunsee'], correct: 1 },
  { id: 129, category: 'Österreich', question: 'Wie heißt die Landeshauptstadt Oberösterreichs?', answers: ['Linz', 'Wels', 'Steyr', 'Ried'], correct: 0 },
  { id: 130, category: 'Österreich', question: 'Welche Stadt ist die Landeshauptstadt des Bundeslandes Salzburg?', answers: ['Salzburg', 'Hallein', 'Zell am See', 'Saalfelden'], correct: 0 },
  { id: 131, category: 'EU', question: 'Wie viele Mitgliedstaaten hat die Europäische Union?', answers: ['25', '27', '28', '30'], correct: 1 },
  { id: 132, category: 'EU', question: 'Welche Währung wird von vielen, aber nicht allen EU-Mitgliedstaaten verwendet?', answers: ['Euro', 'Pfund', 'Franken', 'Krone'], correct: 0 },
  { id: 133, category: 'EU', question: 'In welcher Stadt hat die Europäische Kommission ihren Hauptsitz?', answers: ['Straßburg', 'Brüssel', 'Luxemburg', 'Frankfurt'], correct: 1 },
  { id: 134, category: 'EU', question: 'Welches Organ der EU wird direkt von den Bürgerinnen und Bürgern gewählt?', answers: ['Europäisches Parlament', 'Europäische Kommission', 'Europäischer Rat', 'Europäische Zentralbank'], correct: 0 },
  { id: 135, category: 'EU', question: 'Wie oft finden regulär Wahlen zum Europäischen Parlament statt?', answers: ['Alle 3 Jahre', 'Alle 4 Jahre', 'Alle 5 Jahre', 'Alle 6 Jahre'], correct: 2 },
  { id: 136, category: 'EU', question: 'Welches Land trat 2020 aus der Europäischen Union aus?', answers: ['Norwegen', 'Vereinigtes Königreich', 'Schweiz', 'Island'], correct: 1 },
  { id: 137, category: 'EU', question: 'Welche Stadt ist Sitz der Europäischen Zentralbank?', answers: ['Brüssel', 'Frankfurt am Main', 'Paris', 'Luxemburg'], correct: 1 },
  { id: 138, category: 'EU', question: 'Wie viele Sterne zeigt die Flagge der Europäischen Union?', answers: ['10', '12', '15', '27'], correct: 1 },
  { id: 139, category: 'EU', question: 'Wofür steht die Abkürzung EU?', answers: ['Europäische Union', 'Europäische Einheit', 'Euro-Union', 'Europäische Universität'], correct: 0 },
  { id: 140, category: 'EU', question: 'Welche Institution schlägt in der EU in der Regel neue EU-Rechtsakte vor?', answers: ['Europäische Kommission', 'Europäische Zentralbank', 'Europäischer Rechnungshof', 'Europäischer Gerichtshof'], correct: 0 },
  { id: 141, category: 'EU', question: 'Welche beiden Institutionen beschließen die meisten EU-Rechtsakte gemeinsam?', answers: ['Europäisches Parlament und Rat der EU', 'Kommission und EZB', 'Europäischer Rat und EuGH', 'EuGH und Rechnungshof'], correct: 0 },
  { id: 142, category: 'EU', question: 'Wie heißt das Gericht, das die einheitliche Auslegung des EU-Rechts sicherstellt?', answers: ['Europäischer Gerichtshof', 'Internationaler Strafgerichtshof', 'Europäischer Rechnungshof', 'Europarat'], correct: 0 },
  { id: 143, category: 'EU', question: 'Welcher Vertrag trat 1993 in Kraft und begründete die Europäische Union?', answers: ['Vertrag von Maastricht', 'Vertrag von Versailles', 'Schengener Übereinkommen', 'Vertrag von Rom 2004'], correct: 0 },
  { id: 144, category: 'EU', question: 'Welche vier Freiheiten gehören zum EU-Binnenmarkt?', answers: ['Waren, Personen, Dienstleistungen und Kapital', 'Reisen, Wohnen, Bildung und Kultur', 'Arbeit, Freizeit, Sport und Handel', 'Steuern, Währung, Militär und Polizei'], correct: 0 },
  { id: 145, category: 'EU', question: 'Ist der Euro in jedem EU-Mitgliedstaat die offizielle Währung?', answers: ['Ja, in allen', 'Nein', 'Nur außerhalb der EU', 'Nur in Gründungsstaaten'], correct: 1 },
  { id: 146, category: 'EU', question: 'Welches Land ist EU-Mitglied, verwendet aber nicht den Euro?', answers: ['Polen', 'Österreich', 'Frankreich', 'Portugal'], correct: 0 },
  { id: 147, category: 'EU', question: 'Welche Institution besteht aus den Staats- und Regierungschefs der EU-Mitgliedstaaten?', answers: ['Europäischer Rat', 'Europäische Kommission', 'Europäisches Parlament', 'Europäische Zentralbank'], correct: 0 },
  { id: 148, category: 'EU', question: 'In welcher Stadt finden die monatlichen Plenartagungen des Europäischen Parlaments grundsätzlich statt?', answers: ['Straßburg', 'Berlin', 'Wien', 'Madrid'], correct: 0 },
  { id: 149, category: 'EU', question: 'Was ist der Schengen-Raum hauptsächlich?', answers: ['Ein Raum ohne reguläre Personenkontrollen an vielen gemeinsamen Binnengrenzen', 'Eine gemeinsame EU-Armee', 'Eine EU-Steuerzone', 'Eine gemeinsame Universität'], correct: 0 },
  { id: 150, category: 'EU', question: 'Welches Land gehört zur EU?', answers: ['Österreich', 'Schweiz', 'Norwegen', 'Island'], correct: 0 },
  { id: 151, category: 'Allgemeinwissen', question: 'Welche Rechnung mit vier Vierern ergibt 20?', answers: ['(4 + 4 ÷ 4) × 4','4 + 4 + 4 + 4','4 × 4 + 4 + 4','44 ÷ 4 + 4'], correct: 0 },
  { id: 152, category: 'Allgemeinwissen', question: 'Wie alt warst du, als du klein warst?', answers: ['Älter als heute','Jünger als heute','Genau so alt wie heute','Immer 10'], correct: 1 },
  { id: 153, category: 'Allgemeinwissen', question: 'Was wird größer, je mehr man davon wegnimmt?', answers: ['Ein Loch','Ein Stein','Ein Glas','Ein Schatten'], correct: 0 },
  { id: 154, category: 'Allgemeinwissen', question: 'Was hat einen Hals, aber keinen Kopf?', answers: ['Eine Flasche','Ein Tisch','Ein Schuh','Ein Fenster'], correct: 0 },
  { id: 155, category: 'Allgemeinwissen', question: 'Was wird nass, während es trocknet?', answers: ['Ein Handtuch','Eine Kerze','Ein Spiegel','Ein Buch'], correct: 0 },
  { id: 156, category: 'Allgemeinwissen', question: 'Was hat Städte, aber keine Häuser, und Flüsse, aber kein Wasser?', answers: ['Eine Landkarte','Ein Fernseher','Ein Kalender','Ein Wörterbuch'], correct: 0 },
  { id: 157, category: 'Allgemeinwissen', question: 'Du überholst in einem Rennen die Person auf Platz 2. Auf welchem Platz bist du jetzt?', answers: ['Platz 1','Platz 2','Platz 3','Letzter Platz'], correct: 1 },
  { id: 158, category: 'Allgemeinwissen', question: 'Ein Bauer hat 17 Schafe. 9 laufen weg. Wie viele bleiben?', answers: ['8','9','17','26'], correct: 0 },
  { id: 159, category: 'Allgemeinwissen', question: 'Welche Zahl kommt als Nächstes: 2, 4, 8, 16, ...?', answers: ['20','24','30','32'], correct: 3 },
  { id: 160, category: 'Allgemeinwissen', question: 'Was ist schwerer: 1 kg Federn oder 1 kg Eisen?', answers: ['Die Federn','Das Eisen','Beides gleich schwer','Kommt auf die Farbe an'], correct: 2 },
  { id: 161, category: 'Allgemeinwissen', question: '5 Maschinen brauchen 5 Minuten für 5 Teile. Wie lange brauchen 100 Maschinen für 100 Teile?', answers: ['5 Minuten','20 Minuten','100 Minuten','500 Minuten'], correct: 0 },
  { id: 162, category: 'Allgemeinwissen', question: 'Du hast 3 Äpfel und nimmst 2 davon. Wie viele Äpfel hast du?', answers: ['1','2','3','5'], correct: 1 },
  { id: 163, category: 'Allgemeinwissen', question: 'Wie viele Monate haben mindestens 28 Tage?', answers: ['1','2','6','12'], correct: 3 },
  { id: 164, category: 'Allgemeinwissen', question: 'Was ist 15 + 6 ÷ 3?', answers: ['7','17','21','27'], correct: 1 },
  { id: 165, category: 'Allgemeinwissen', question: 'Wie viel sind 25 % von 80?', answers: ['10','20','25','40'], correct: 1 },
  { id: 166, category: 'Allgemeinwissen', question: 'Wie viel sind drei Viertel von 100?', answers: ['25','50','75','80'], correct: 2 },
  { id: 167, category: 'Allgemeinwissen', question: 'Ein Produkt kostet 50 € und ist um 20 % reduziert. Was kostet es danach?', answers: ['30 €','35 €','40 €','45 €'], correct: 2 },
  { id: 168, category: 'Allgemeinwissen', question: 'Du hast 12 Eier. 3 davon zerbrechen, werden gebraten und gegessen. Wie viele ganze Eier bleiben?', answers: ['3','6','9','12'], correct: 2 },
  { id: 169, category: 'Allgemeinwissen', question: 'Wenn gestern Sonntag war, welcher Tag ist morgen?', answers: ['Montag','Dienstag','Mittwoch','Samstag'], correct: 1 },
  { id: 170, category: 'Allgemeinwissen', question: 'Eine Uhr zeigt genau 3:00 Uhr. Wie groß ist der kleinere Winkel zwischen den Zeigern?', answers: ['45°','60°','90°','180°'], correct: 2 },
  { id: 171, category: 'Allgemeinwissen', question: 'Welche europaweit gültige Notrufnummer funktioniert in allen EU-Ländern?', answers: ['110','112','118','911'], correct: 1 },
  { id: 172, category: 'Allgemeinwissen', question: 'Wofür ist ein Rauchmelder gedacht?', answers: ['Rauch bei einem Brand','Wasserverlust','Strompreis','Internetstörungen'], correct: 0 },
  { id: 173, category: 'Allgemeinwissen', question: 'Welche Eigenschaft macht Kohlenmonoxid besonders gefährlich?', answers: ['Es ist farb- und geruchlos','Es leuchtet blau','Es riecht stark süß','Es gefriert bei Raumtemperatur'], correct: 0 },
  { id: 174, category: 'Allgemeinwissen', question: 'Was darfst du bei brennendem Speiseöl niemals verwenden?', answers: ['Wasser','Einen passenden Deckel','Eine Löschdecke','Geeigneten Feuerlöscher'], correct: 0 },
  { id: 175, category: 'Allgemeinwissen', question: 'Was ist ein typisches Warnzeichen für Phishing?', answers: ['Eine dringende Aufforderung, sofort einen Link zu öffnen','Eine erwartete Rechnung vom bekannten Händler','Eine lokal gespeicherte Datei','Ein normaler Kalendertermin'], correct: 0 },
  { id: 176, category: 'Allgemeinwissen', question: 'Was ist bei Passwörtern am sichersten?', answers: ['Dasselbe Passwort überall','Ein langes, einzigartiges Passwort pro Konto','Nur den Vornamen verwenden','Passwörter per Chat verschicken'], correct: 1 },
  { id: 177, category: 'Allgemeinwissen', question: 'Wozu dient die Zwei-Faktor-Authentifizierung?', answers: ['Sie beschleunigt das Internet','Sie verlangt einen zweiten Nachweis beim Anmelden','Sie löscht alte Passwörter','Sie macht Backups'], correct: 1 },
  { id: 178, category: 'Allgemeinwissen', question: 'Wozu dient ein Backup?', answers: ['Daten bei Verlust oder Defekt wiederherzustellen','Den Bildschirm heller zu machen','Das WLAN zu beschleunigen','Passwörter öffentlich zu speichern'], correct: 0 },
  { id: 179, category: 'Allgemeinwissen', question: 'Wie vergleichst du Lebensmittelpreise am fairsten?', answers: ['Preis pro Kilogramm oder Liter','Nur die Packungsfarbe','Nur den Gesamtpreis','Nur die Marke'], correct: 0 },
  { id: 180, category: 'Allgemeinwissen', question: 'Warum kann ein Kassenbon wichtig sein?', answers: ['Als Nachweis für Kauf und Reklamation','Er erhöht automatisch die Garantie','Er ersetzt den Ausweis','Er senkt den Stromverbrauch'], correct: 0 },
  { id: 181, category: 'Allgemeinwissen', question: 'Warum löst ein Leitungsschutzschalter aus?', answers: ['Zum Schutz bei zu hohem Strom oder Fehlern','Um WLAN zu sparen','Um Wasser zu stoppen','Um Fenster zu verriegeln'], correct: 0 },
  { id: 182, category: 'Allgemeinwissen', question: 'Warum sollte eine Mehrfachsteckdose nicht überlastet werden?', answers: ['Es kann zu Überhitzung und Brand kommen','Das Internet wird langsamer','Die Lampe wird heller','Der Kühlschrank friert stärker'], correct: 0 },
  { id: 183, category: 'Allgemeinwissen', question: 'Wie taut man tiefgefrorene Lebensmittel am sichersten auf?', answers: ['Im Kühlschrank','Auf der Heizung','In direkter Sonne','Über Nacht auf der Arbeitsplatte'], correct: 0 },
  { id: 184, category: 'Allgemeinwissen', question: 'Wie lange sollte gründliches Händewaschen mit Seife ungefähr dauern?', answers: ['5 Sekunden','10 Sekunden','Mindestens etwa 20 Sekunden','2 Minuten'], correct: 2 },
  { id: 185, category: 'Allgemeinwissen', question: 'Wie vermeidest du Kreuzkontamination in der Küche?', answers: ['Rohes Fleisch von verzehrfertigen Lebensmitteln trennen','Alles auf demselben ungewaschenen Brett schneiden','Rohes Fleisch über Salat lagern','Dasselbe Messer ungewaschen verwenden'], correct: 0 },
  { id: 186, category: 'Allgemeinwissen', question: 'Was bedeutet ein Verbrauchsdatum im Unterschied zum Mindesthaltbarkeitsdatum?', answers: ['Es betrifft stärker die Lebensmittelsicherheit','Es ist nur Dekoration','Es zeigt den Preis','Es gilt nur für Getränke'], correct: 0 },
  { id: 187, category: 'Allgemeinwissen', question: 'Welche Lebensmittel liefern typischerweise viele Ballaststoffe?', answers: ['Vollkornprodukte und Hülsenfrüchte','Zucker und Limonade','Butter und Öl','Salz und Wasser'], correct: 0 },
  { id: 188, category: 'Allgemeinwissen', question: 'Welche Lebensmittelgruppe ist eine typische Proteinquelle?', answers: ['Hülsenfrüchte','Zucker','Mineralwasser','Salz'], correct: 0 },
  { id: 189, category: 'Allgemeinwissen', question: 'Bei welcher Temperatur kocht Wasser ungefähr auf Meereshöhe?', answers: ['0 °C','50 °C','100 °C','150 °C'], correct: 2 },
  { id: 190, category: 'Allgemeinwissen', question: 'Wofür steht der Lichtschutzfaktor SPF auf Sonnencreme hauptsächlich?', answers: ['Schutz vor UVB-Strahlung','Schutz vor Kälte','Wasserhärte','Vitamin-D-Gehalt'], correct: 0 },
  { id: 191, category: 'Allgemeinwissen', question: 'Was bedeutet ein hoher UV-Index?', answers: ['Stärkere UV-Belastung und mehr Schutzbedarf','Weniger Sonnenstrahlung','Sicheres Sonnenbaden ohne Schutz','Niedrige Luftfeuchtigkeit'], correct: 0 },
  { id: 192, category: 'Allgemeinwissen', question: 'Wer sollte im Auto angeschnallt sein?', answers: ['Alle Insassen','Nur der Fahrer','Nur vorne Sitzende','Nur Kinder'], correct: 0 },
  { id: 193, category: 'Allgemeinwissen', question: 'Was passiert mit dem Bremsweg bei höherer Geschwindigkeit grundsätzlich?', answers: ['Er wird länger','Er wird immer kürzer','Er bleibt gleich','Er verschwindet'], correct: 0 },
  { id: 194, category: 'Allgemeinwissen', question: 'Wann misst man den Reifendruck am besten?', answers: ['Bei möglichst kalten Reifen','Direkt nach langer Autobahnfahrt','Nur bei Regen','Nur im Winter'], correct: 0 },
  { id: 195, category: 'Allgemeinwissen', question: 'Wie reagierst du bei Aquaplaning am sinnvollsten?', answers: ['Ruhig Gas wegnehmen und hektische Lenkbewegungen vermeiden','Scharf beschleunigen','Lenkrad ruckartig drehen','Handbremse ziehen'], correct: 0 },
  { id: 196, category: 'Allgemeinwissen', question: 'Was bedeutet eine rote Ampel?', answers: ['Anhalten','Beschleunigen','Nur hupen','Immer rechts abbiegen'], correct: 0 },
  { id: 197, category: 'Allgemeinwissen', question: 'Warum reicht der Spiegel beim Spurwechsel nicht immer aus?', answers: ['Wegen des toten Winkels','Weil Spiegel keine Farben zeigen','Weil sie nur nachts funktionieren','Weil sie das Auto langsamer machen'], correct: 0 },
  { id: 198, category: 'Allgemeinwissen', question: 'Was hat Vorrang, wenn Navigation und Verkehrszeichen widersprechen?', answers: ['Die gültigen Verkehrszeichen','Immer das Navi','Immer die kürzere Strecke','Die Musik-App'], correct: 0 },
  { id: 199, category: 'Allgemeinwissen', question: 'Wo liegt Norden auf den meisten Karten, wenn nichts anderes angegeben ist?', answers: ['Oben','Unten','Links','Rechts'], correct: 0 },
  { id: 200, category: 'Allgemeinwissen', question: 'Wofür steht UTC?', answers: ['Eine weltweite Zeitreferenz','Eine Währung','Eine Stromart','Ein Dateiformat'], correct: 0 },
  { id: 201, category: 'Allgemeinwissen', question: 'Bei wie viel Grad Celsius gefriert reines Wasser ungefähr?', answers: ['-10 °C','0 °C','10 °C','100 °C'], correct: 1 },
  { id: 202, category: 'Allgemeinwissen', question: 'Welche Uhrzeit entspricht 18:30 im 12-Stunden-System?', answers: ['6:30 AM','6:30 PM','8:30 PM','5:30 PM'], correct: 1 },
  { id: 203, category: 'Allgemeinwissen', question: 'Wie berechnet man die Fläche eines Rechtecks?', answers: ['Länge × Breite','Länge + Breite','2 × Länge','Breite ÷ Länge'], correct: 0 },
  { id: 204, category: 'Allgemeinwissen', question: 'Wie viel sind 10 % von 80?', answers: ['4','8','10','16'], correct: 1 },
  { id: 205, category: 'Allgemeinwissen', question: 'Was ist der Durchschnitt von 10, 20 und 30?', answers: ['15','20','25','30'], correct: 1 },
  { id: 206, category: 'Allgemeinwissen', question: 'Wozu dient BCC in einer E-Mail?', answers: ['Empfänger voreinander zu verbergen','Eine Datei zu komprimieren','Die Schrift zu vergrößern','E-Mails automatisch zu löschen'], correct: 0 },
  { id: 207, category: 'Allgemeinwissen', question: 'Welches Dateiformat wird häufig für Dokumente verwendet, die auf verschiedenen Geräten gleich aussehen sollen?', answers: ['PDF','MP3','JPG','EXE'], correct: 0 },
  { id: 208, category: 'Allgemeinwissen', question: 'Wofür wird Bluetooth typischerweise genutzt?', answers: ['Kabellose Verbindung über kurze Distanz','Satellitennavigation','Stromerzeugung','Cloud-Backup ohne Netzwerk'], correct: 0 },
  { id: 209, category: 'Allgemeinwissen', question: 'Welche Aufgabe hat RAM in einem Computer hauptsächlich?', answers: ['Temporärer Arbeitsspeicher für laufende Programme','Dauerhafte Papierablage','Internetvertrag','Bildschirmbeleuchtung'], correct: 0 },
  { id: 210, category: 'Allgemeinwissen', question: 'Was speichert ein Browser-Cache hauptsächlich?', answers: ['Temporäre Webseitendaten für schnelleres Laden','Banknoten','SIM-Karten','GPS-Satelliten'], correct: 0 },
  { id: 211, category: 'Allgemeinwissen', question: 'Was beschreibt der Zinseszinseffekt?', answers: ['Zinsen werden auch auf bereits erhaltene Zinsen berechnet','Zinsen verschwinden jedes Jahr','Nur Gebühren werden verzinst','Der Zinssatz ist immer null'], correct: 0 },
  { id: 212, category: 'Allgemeinwissen', question: 'Was ist bei Krediten meist aussagekräftiger als nur der Sollzinssatz?', answers: ['Der effektive Jahreszins','Die Farbe der Bankkarte','Die Kontonummer','Die Filialgröße'], correct: 0 },
  { id: 213, category: 'Allgemeinwissen', question: 'Was ist eine reale Rendite?', answers: ['Rendite nach Berücksichtigung der Inflation','Rendite vor Gebühren und Inflation','Nur Dividenden','Nur Kontostand'], correct: 0 },
  { id: 214, category: 'Allgemeinwissen', question: 'Was ist der Hauptzweck von Diversifikation beim Investieren?', answers: ['Risiken auf mehrere Anlagen zu verteilen','Jede Verlustmöglichkeit auszuschließen','Nur eine Aktie zu kaufen','Steuern vollständig zu vermeiden'], correct: 0 },
  { id: 215, category: 'Allgemeinwissen', question: 'Warum kann eine fast richtig geschriebene Webadresse gefährlich sein?', answers: ['Sie kann zu einer gefälschten Phishing-Seite führen','Sie erhöht automatisch die Sicherheit','Sie macht die Seite schneller','Sie ist immer offiziell'], correct: 0 },
  { id: 216, category: 'Allgemeinwissen', question: 'Welchen Vorteil hat ein Passwortmanager?', answers: ['Er kann starke, einzigartige Passwörter sicher verwalten','Er veröffentlicht Passwörter','Er ersetzt jedes Backup','Er verhindert jede Form von Betrug'], correct: 0 },
  { id: 217, category: 'Allgemeinwissen', question: 'Was bedeutet Ende-zu-Ende-Verschlüsselung grundsätzlich?', answers: ['Nur die Kommunikationsendpunkte sollen den Inhalt lesen können','Jeder Server kann den Inhalt offen lesen','Nachrichten sind öffentlich','Es gibt keine Passwörter mehr'], correct: 0 },
  { id: 218, category: 'Allgemeinwissen', question: 'Welche Information können Fotometadaten enthalten?', answers: ['Aufnahmezeit und eventuell Standortdaten','Nur die Farbe des Handys','Nur den Akkustand','Immer das Bankkonto'], correct: 0 },
  { id: 219, category: 'Allgemeinwissen', question: 'Was kann ein VPN nicht garantieren?', answers: ['Vollständige Anonymität im Internet','Eine verschlüsselte Verbindung zum VPN-Anbieter','Eine andere sichtbare IP-Adresse','Schutz im lokalen Netzwerkpfad'], correct: 0 },
  { id: 220, category: 'Allgemeinwissen', question: 'Was versteckt der Inkognito-Modus normalerweise nicht?', answers: ['Deinen Datenverkehr vor Internetanbieter oder Arbeitgebernetzwerk','Lokalen Browserverlauf nach dem Schließen','Cookies der Sitzung nach dem Schließen','Formulardaten aus der Sitzung'], correct: 0 },
  { id: 221, category: 'Allgemeinwissen', question: 'Wozu dient eine Prüfsumme bei einer Datei?', answers: ['Zur Kontrolle, ob sich die Datei verändert hat','Zum Vergrößern der Datei','Zum Übersetzen des Inhalts','Zum Drucken'], correct: 0 },
  { id: 222, category: 'Allgemeinwissen', question: 'Was macht Ransomware typischerweise?', answers: ['Sie verschlüsselt oder sperrt Daten und fordert Geld','Sie verbessert die Bildschirmauflösung','Sie senkt Stromkosten','Sie repariert Backups'], correct: 0 },
  { id: 223, category: 'Allgemeinwissen', question: 'Was bedeutet Social Engineering in der IT-Sicherheit?', answers: ['Menschen zu manipulieren, damit sie Informationen oder Zugriff geben','Computergehäuse zu bauen','Soziale Netzwerke zu programmieren','Nur Werbung zu blockieren'], correct: 0 },
  { id: 224, category: 'Allgemeinwissen', question: 'Was bedeutet das Prinzip der geringsten Rechte?', answers: ['Nur die Zugriffsrechte vergeben, die wirklich nötig sind','Allen Administratorrechte geben','Passwörter gemeinsam nutzen','Jede App alles dürfen lassen'], correct: 0 },
  { id: 225, category: 'Allgemeinwissen', question: 'Ein Gerät mit 2 kW läuft 3 Stunden. Wie viel Energie verbraucht es?', answers: ['2 kWh','5 kWh','6 kWh','9 kWh'], correct: 2 },
  { id: 226, category: 'Allgemeinwissen', question: 'Was ist Standby-Verbrauch?', answers: ['Stromverbrauch eines Geräts, obwohl es nicht aktiv genutzt wird','Stromverbrauch nur beim Einschalten','Kostenloser Strom','Nur Solarstrom'], correct: 0 },
  { id: 227, category: 'Allgemeinwissen', question: 'Wovor schützt ein FI/RCD besonders?', answers: ['Gefährliche Fehlerströme','Hohe Internetkosten','Leere Batterien','Wasserhärte'], correct: 0 },
  { id: 228, category: 'Allgemeinwissen', question: 'Wovor schützt ein Leitungsschutzschalter hauptsächlich?', answers: ['Überstrom in Leitungen','Kohlenmonoxid','Datenverlust','Reifenverschleiß'], correct: 0 },
  { id: 229, category: 'Allgemeinwissen', question: 'Welche Netzspannung ist in vielen europäischen Haushalten üblich?', answers: ['110 V','230 V','4000 V','12 V'], correct: 1 },
  { id: 230, category: 'Allgemeinwissen', question: 'Warum ersetzt ein Rauchmelder keinen Kohlenmonoxidmelder?', answers: ['Weil beide unterschiedliche Gefahren erkennen','Weil Rauchmelder nur draußen funktionieren','Weil CO sichtbar ist','Weil CO immer stark riecht'], correct: 0 },
  { id: 231, category: 'Allgemeinwissen', question: 'Welche drei Dinge bilden das klassische Feuerdreieck?', answers: ['Brennstoff, Sauerstoff und Wärme','Wasser, Sand und Wind','Strom, Metall und Glas','Rauch, Licht und Lärm'], correct: 0 },
  { id: 232, category: 'Allgemeinwissen', question: 'Warum ist Wasser auf brennendem Fett so gefährlich?', answers: ['Es kann schlagartig verdampfen und brennendes Fett verteilen','Es kühlt das Fett immer sicher','Es macht den Brand unsichtbar','Es löscht nur den Rauch'], correct: 0 },
  { id: 233, category: 'Allgemeinwissen', question: 'Welche Kühlschranktemperatur ist für viele leicht verderbliche Lebensmittel sinnvoll?', answers: ['Etwa 4 °C','Etwa 15 °C','Etwa 25 °C','Etwa -20 °C'], correct: 0 },
  { id: 234, category: 'Allgemeinwissen', question: 'In welchem Temperaturbereich vermehren sich viele Keime in Lebensmitteln besonders gut?', answers: ['Ungefähr zwischen 5 °C und 60 °C','Nur unter -20 °C','Nur über 100 °C','Nur exakt bei 0 °C'], correct: 0 },
  { id: 235, category: 'Allgemeinwissen', question: 'Was bedeutet Kreuzkontamination?', answers: ['Keime werden von einem Lebensmittel oder Gegenstand auf einen anderen übertragen','Lebensmittel werden eingefroren','Wasser verdampft','Salz löst sich auf'], correct: 0 },
  { id: 236, category: 'Allgemeinwissen', question: 'Welche Aussage zum Mindesthaltbarkeitsdatum ist richtig?', answers: ['Es betrifft vor allem Qualität; ein Produkt kann danach noch in Ordnung sein','Es ist immer ein absolutes Sicherheitsdatum','Danach ist jedes Produkt automatisch giftig','Es gilt nur für Tiefkühlkost'], correct: 0 },
  { id: 237, category: 'Allgemeinwissen', question: 'Was bewirkt Einfrieren bei vielen Bakterien?', answers: ['Es stoppt oder verlangsamt ihr Wachstum, tötet aber nicht alle','Es tötet garantiert alle','Es verdoppelt ihre Zahl sofort','Es verwandelt sie in Viren'], correct: 0 },
  { id: 238, category: 'Allgemeinwissen', question: 'Welche Aussage zu Bluthochdruck ist richtig?', answers: ['Er kann lange ohne spürbare Symptome bestehen','Er verursacht immer sofort starke Schmerzen','Er ist immer sichtbar','Er betrifft nur Sportler'], correct: 0 },
  { id: 239, category: 'Allgemeinwissen', question: 'Wofür steht FAST bei einem möglichen Schlaganfall?', answers: ['Face, Arms, Speech, Time','Food, Air, Sleep, Temperature','Feet, Ankles, Skin, Teeth','Fast, Alert, Safe, Talk'], correct: 0 },
  { id: 240, category: 'Allgemeinwissen', question: 'Welche Frequenz wird für Herzdruckmassage bei Erwachsenen häufig empfohlen?', answers: ['40–60 pro Minute','60–80 pro Minute','100–120 pro Minute','160–180 pro Minute'], correct: 2 },
  { id: 241, category: 'Allgemeinwissen', question: 'Was ist bei einer bewusstlosen, aber normal atmenden Person grundsätzlich sinnvoll?', answers: ['Stabile Seitenlage und Atmung überwachen','Allein lassen','Etwas zu trinken geben','Zum Gehen zwingen'], correct: 0 },
  { id: 242, category: 'Allgemeinwissen', question: 'Auf einer Karte im Maßstab 1:50.000 entsprechen 1 cm ungefähr wie viel in der Realität?', answers: ['50 m','500 m','5 km','50 km'], correct: 1 },
  { id: 243, category: 'Allgemeinwissen', question: 'Was bedeutet ein niedrigerer Wert bei Litern pro 100 km?', answers: ['Weniger Kraftstoffverbrauch','Mehr Kraftstoffverbrauch','Größerer Motor','Mehr Reifendruck'], correct: 0 },
  { id: 244, category: 'Allgemeinwissen', question: 'Warum ist korrekter Reifendruck wichtig?', answers: ['Für Fahrstabilität, Reifenverschleiß und Verbrauch','Nur für die Farbe des Reifens','Nur für das Radio','Er hat keine Wirkung'], correct: 0 },
  { id: 245, category: 'Allgemeinwissen', question: 'Wie verändert sich der reine Bremsweg ungefähr, wenn sich die Geschwindigkeit verdoppelt?', answers: ['Er bleibt gleich','Er verdoppelt sich','Er vervierfacht sich ungefähr','Er halbiert sich'], correct: 2 },
  { id: 246, category: 'Allgemeinwissen', question: 'Was erhöht in Wohnräumen das Schimmelrisiko besonders?', answers: ['Dauerhaft hohe Feuchtigkeit','Regelmäßiges Lüften','Trockene Oberflächen','Ausreichende Beheizung'], correct: 0 },
  { id: 247, category: 'Allgemeinwissen', question: 'Wann entsteht Kondenswasser besonders leicht?', answers: ['Wenn warme feuchte Luft auf eine kalte Oberfläche trifft','Wenn trockene Luft erwärmt wird','Wenn Metall im Schatten liegt','Nur bei Wind'], correct: 0 },
  { id: 248, category: 'Allgemeinwissen', question: 'Was ist bei wiederkehrendem Schimmel wichtiger als nur Überstreichen?', answers: ['Die Feuchtigkeitsursache finden und beheben','Nur Duftspray verwenden','Fenster dauerhaft schließen','Mehr Möbel davor stellen'], correct: 0 },
  { id: 249, category: 'Allgemeinwissen', question: 'Was bedeutet Selbstbehalt bei einer Versicherung?', answers: ['Den Anteil, den man im Schadensfall selbst trägt','Die monatliche Miete','Die Bankgebühr für Überweisungen','Den Kaufpreis des Autos'], correct: 0 },
  { id: 250, category: 'Allgemeinwissen', question: 'Was bedeutet Opportunitätskosten?', answers: ['Der Wert der besten Alternative, auf die man verzichtet','Nur Bargeldkosten','Nur Steuern','Kosten ohne jede Alternative'], correct: 0 },
];

export const QUESTION_TRANSLATIONS: Partial<Record<QuestionLocale, Record<number, LocalizedQuestion>>> = {
  RU:{1:{question:'Какова столица Канады?',answers:['Торонто','Оттава','Ванкувер','Монреаль']},2:{question:'Какая река протекает через Вену?',answers:['Рейн','Эльба','Дунай','Майн']},3:{question:'Какой континент самый большой по площади?',answers:['Африка','Азия','Европа','Южная Америка']},21:{question:'Какая страна занимает наибольшую площадь в мире?',answers:['Канада','Китай','Россия','США']},22:{question:'Какие горы разделяют значительную часть Европы и Азии?',answers:['Альпы','Урал','Анды','Карпаты']},23:{question:'Какая столица расположена на Темзе?',answers:['Дублин','Лондон','Амстердам','Брюссель']},24:{question:'Какой стране принадлежит остров Сицилия?',answers:['Испания','Греция','Италия','Португалия']},25:{question:'Какой океан находится между Африкой и Австралией?',answers:['Атлантический','Тихий','Индийский','Северный Ледовитый']},26:{question:'Какой город является столицей Австралии?',answers:['Сидней','Мельбурн','Канберра','Перт']},27:{question:'Какая страна граничит и с Германией, и с Италией?',answers:['Бельгия','Австрия','Дания','Польша']},28:{question:'На каком континенте находится Сахара?',answers:['Азия','Африка','Южная Америка','Австралия']},29:{question:'Какова столица Японии?',answers:['Сеул','Пекин','Токио','Бангкок']},30:{question:'Какое море находится между Европой и Африкой?',answers:['Северное море','Средиземное море','Балтийское море','Чёрное море']},31:{question:'Какая страна по форме напоминает сапог?',answers:['Италия','Хорватия','Португалия','Албания']},32:{question:'Какова столица Турции?',answers:['Стамбул','Анкара','Измир','Бурса']},33:{question:'Какой континент находится у Южного полюса?',answers:['Антарктида','Европа','Азия','Африка']},34:{question:'Какая река протекает через Париж?',answers:['Сена','Дунай','Темза','Тибр']},35:{question:'Какова столица Египта?',answers:['Каир','Рабат','Тунис','Амман']},36:{question:'Какая страна расположена к западу от Испании на Пиренейском полуострове?',answers:['Португалия','Франция','Италия','Марокко']},37:{question:'Какой остров является крупнейшим в мире?',answers:['Мадагаскар','Гренландия','Борнео','Исландия']}},
  EN:{1:{question:'What is the capital of Canada?',answers:['Toronto','Ottawa','Vancouver','Montreal']},2:{question:'Which river flows through Vienna?',answers:['Rhine','Elbe','Danube','Main']},3:{question:'Which continent is the largest by area?',answers:['Africa','Asia','Europe','South America']},4:{question:'What is the chemical symbol for gold?',answers:['Ag','Au','Gd','Go']},5:{question:'How many planets are in our solar system?',answers:['7','8','9','10']},6:{question:'Which unit measures electrical voltage?',answers:['Watt','Volt','Ampere','Ohm']},21:{question:'Which country has the largest land area in the world?',answers:['Canada','China','Russia','USA']},22:{question:'Which mountain range separates large parts of Europe and Asia?',answers:['Alps','Ural Mountains','Andes','Carpathians']},23:{question:'Which capital lies on the River Thames?',answers:['Dublin','London','Amsterdam','Brussels']},24:{question:'Which country does Sicily belong to?',answers:['Spain','Greece','Italy','Portugal']},25:{question:'Which ocean lies between Africa and Australia?',answers:['Atlantic Ocean','Pacific Ocean','Indian Ocean','Arctic Ocean']},26:{question:'What is the capital of Australia?',answers:['Sydney','Melbourne','Canberra','Perth']},27:{question:'Which country borders both Germany and Italy?',answers:['Belgium','Austria','Denmark','Poland']},28:{question:'On which continent is the Sahara?',answers:['Asia','Africa','South America','Australia']},29:{question:'What is the capital of Japan?',answers:['Seoul','Beijing','Tokyo','Bangkok']},30:{question:'Which sea lies between Europe and Africa?',answers:['North Sea','Mediterranean Sea','Baltic Sea','Black Sea']},31:{question:'Which country is shaped like a boot?',answers:['Italy','Croatia','Portugal','Albania']},32:{question:'What is the capital of Turkey?',answers:['Istanbul','Ankara','Izmir','Bursa']},33:{question:'Which continent is at the South Pole?',answers:['Antarctica','Europe','Asia','Africa']},34:{question:'Which river flows through Paris?',answers:['Seine','Danube','Thames','Tiber']},35:{question:'What is the capital of Egypt?',answers:['Cairo','Rabat','Tunis','Amman']},36:{question:'Which country lies west of Spain on the Iberian Peninsula?',answers:['Portugal','France','Italy','Morocco']},37:{question:'What is the largest island in the world?',answers:['Madagascar','Greenland','Borneo','Iceland']},38:{question:'Which planet is closest to the Sun?',answers:['Venus','Mars','Mercury','Earth']},39:{question:'Which gas do humans mainly need for breathing?',answers:['Nitrogen','Oxygen','Helium','Hydrogen']},40:{question:'What is the change from liquid water to water vapor called?',answers:['Freezing','Evaporation','Condensation','Melting']},41:{question:'Which organ pumps blood through the human body?',answers:['Liver','Lung','Heart','Kidney']},42:{question:'How many bones does an adult human typically have?',answers:['106','206','306','406']},43:{question:'Which force pulls objects toward Earth?',answers:['Magnetism','Gravity','Friction','Buoyancy']},44:{question:'Which planet is known for its prominent ring system?',answers:['Mars','Saturn','Mercury','Venus']},45:{question:'What is H2O?',answers:['Oxygen','Salt','Water','Hydrogen']},46:{question:'Which blood vessel generally carries blood away from the heart?',answers:['Artery','Vein','Capillary','Lymph vessel']},47:{question:'Which unit is used for electric current?',answers:['Volt','Ampere','Watt','Joule']},48:{question:'What does DNA mainly contain?',answers:['Genetic information','Body temperature','Blood pressure','Digestion']},49:{question:'Which animal is a mammal?',answers:['Shark','Dolphin','Trout','Octopus']},50:{question:'What is the process by which plants use light energy called?',answers:['Photosynthesis','Fermentation','Distillation','Osmosis']},51:{question:'Which metal is liquid at room temperature?',answers:['Iron','Mercury','Copper','Aluminum']},52:{question:'How many chromosomes does a normal human body cell have?',answers:['23','46','44','92']},53:{question:'Which layer protects Earth from much of the UV radiation?',answers:['Ozone layer','Earth core','Troposphere alone','Magnetic core']},54:{question:'What is the center of an atom called?',answers:['Electron','Atomic nucleus','Molecule','Ion']},7:{question:'Who painted the Mona Lisa?',answers:['Michelangelo','Raphael','Leonardo da Vinci','Rembrandt']},8:{question:'In which city is the Colosseum?',answers:['Athens','Rome','Madrid','Paris']},9:{question:'What is the Japanese art of paper folding called?',answers:['Ikebana','Origami','Haiku','Kabuki']},10:{question:'In which year did the Berlin Wall fall?',answers:['1987','1989','1991','1993']},11:{question:'Which empire built Machu Picchu?',answers:['Aztec','Maya','Inca','Roman']},12:{question:'Who was the first person on the Moon?',answers:['Buzz Aldrin','Neil Armstrong','Yuri Gagarin','John Glenn']},13:{question:'How many pillars of Islam are there?',answers:['Three','Four','Five','Six']},14:{question:'What is the obligatory prayer before sunrise called?',answers:['Fajr','Dhuhr','Asr','Isha']},15:{question:'In which month do Muslims fast from dawn until sunset?',answers:['Muharram','Rajab','Ramadan','Shawwal']},16:{question:'Which direction do Muslims face during the obligatory prayer?',answers:['Toward Medina','Toward the Kaaba in Mecca','Toward Jerusalem','North']},17:{question:'How many obligatory prayers are there each day?',answers:['Three','Four','Five','Six']},18:{question:'What is the obligatory charity on certain wealth called when its conditions are met?',answers:['Sadaqah','Zakat','Fidya','Waqf']},19:{question:'Who is the last prophet?',answers:['Ibrahim','Musa','Isa','Muhammad']},20:{question:'What is the pilgrimage to Mecca that is one of the five pillars of Islam called?',answers:['Umrah','Hajj','Hijra','Itikaf']},55:{question:'Who wrote the play Romeo and Juliet?',answers:['Goethe','Shakespeare','Schiller','Dante']},56:{question:'Which instrument typically has 88 keys?',answers:['Piano','Violin','Trumpet','Flute']},57:{question:'Which country does Kabuki come from?',answers:['China','Japan','India','Korea']},58:{question:'Who composed the Ninth Symphony featuring Ode to Joy?',answers:['Mozart','Beethoven','Bach','Vivaldi']},59:{question:'What is a poem traditionally consisting of 14 lines called?',answers:['Sonnet','Novel','Essay','Fable']},60:{question:'Which artist painted The Starry Night?',answers:['Van Gogh','Picasso','Monet','Dalí']},61:{question:'In which country did flamenco originate?',answers:['Spain','France','Mexico','Portugal']},62:{question:'What is the art of beautiful handwriting called?',answers:['Calligraphy','Lithography','Photography','Choreography']},63:{question:'Who wrote the novel The Trial?',answers:['Franz Kafka','Thomas Mann','Hermann Hesse','Stefan Zweig']},64:{question:'Which dance is closely associated with Argentina?',answers:['Tango','Waltz','Polka','Samba']},65:{question:'Which painter is known for Guernica?',answers:['Picasso','Rembrandt','Klimt','Munch']},66:{question:'What is a longer fictional story in book form called?',answers:['Novel','Sonnet','Opera','Sculpture']},67:{question:'Which Austrian composer was born in Salzburg?',answers:['Mozart','Beethoven','Brahms','Wagner']},68:{question:'Which art form mainly uses three-dimensional figures and forms?',answers:['Sculpture','Poetry','Opera','Photography']},69:{question:'What is the famous Paris museum that displays the Mona Lisa?',answers:['Louvre','Prado','Uffizi','Tate Modern']},70:{question:'Who wrote The Metamorphosis?',answers:['Franz Kafka','Bertolt Brecht','Heinrich Heine','Erich Kästner']},71:{question:'Which color is traditionally produced by mixing blue and yellow?',answers:['Green','Orange','Purple','Red']},72:{question:'Which ancient city was buried by the eruption of Mount Vesuvius in AD 79?',answers:['Pompeii','Sparta','Troy','Alexandria']},73:{question:'Who developed printing with movable metal type in Europe?',answers:['Johannes Gutenberg','Galileo Galilei','Isaac Newton','James Watt']},74:{question:'In which year did World War I begin?',answers:['1912','1914','1916','1918']},75:{question:'Which civilization built the great pyramids of Giza?',answers:['Ancient Egypt','Roman Empire','Inca','Vikings']},76:{question:'Who was the first president of the United States?',answers:['George Washington','Abraham Lincoln','Thomas Jefferson','John Adams']},77:{question:'Which city was the center of the Byzantine Empire?',answers:['Constantinople','Paris','Madrid','Vienna']},78:{question:'Which people are especially associated with longships and voyages from Scandinavia?',answers:['Vikings','Aztecs','Persians','Phoenicians']},79:{question:'Which revolution began in 1789?',answers:['French Revolution','Industrial Revolution','Russian Revolution','American Civil War']},80:{question:'Which Macedonian conqueror was known as Alexander the Great?',answers:['Alexander III of Macedon','Julius Caesar','Hannibal','Pericles']},81:{question:'Which ancient civilization developed around Athens and Sparta?',answers:['Greeks','Maya','Inca','Celts']},82:{question:'In which year did World War II end in Europe?',answers:['1943','1944','1945','1946']},83:{question:'Which historic trade route connected East Asia with regions as far as Europe?',answers:['Silk Road','Amber Road','Route 66','Pan-American Highway']},84:{question:'Which empire had Rome as its capital?',answers:['Roman Empire','Ottoman Empire','Mughal Empire','Aztec Empire']},85:{question:'Who reached the Caribbean in 1492 on behalf of the Spanish Crown?',answers:['Christopher Columbus','Marco Polo','James Cook','Vasco da Gama']},86:{question:'What was the era of European rediscovery of ancient art and scholarship called?',answers:['Renaissance','Bronze Age','Romanticism','Enlightenment']},87:{question:'Which writing system did ancient Egyptians use, among others, on monuments?',answers:['Hieroglyphs','Cuneiform','Runes','Cyrillic']},88:{question:'Which conflict in the United States lasted from 1861 to 1865?',answers:['American Civil War','Seven Years War','Crimean War','Boer War']},89:{question:'What is the declaration of faith and first pillar of Islam called?',answers:['Shahada','Zakat','Sawm','Hajj']},90:{question:'What is the ritual ablution commonly performed before prayer called?',answers:['Wudu','Adhan','Khutbah','Dhikr']},91:{question:'What is the call to prayer called?',answers:['Adhan','Iqra','Tafsir','Suhur']},92:{question:'Which surah is at the beginning of the Quran?',answers:['Al-Fatiha','Al-Baqarah','Al-Ikhlas','An-Nas']},93:{question:'How many surahs are in the Quran?',answers:['99','110','114','120']},94:{question:'What is the night described in the Quran as better than a thousand months called?',answers:['Laylat al-Qadr','Laylat al-Miraj','Arafah','Ashura']},95:{question:'What is the meal before the daily fast begins in Ramadan called?',answers:['Suhur','Iftar','Aqiqah','Walima']},96:{question:'What is breaking the fast after sunset in Ramadan called?',answers:['Iftar','Suhur','Ihram','Tawaf']},97:{question:'Which city is the destination of Hajj?',answers:['Mecca','Medina','Jerusalem','Damascus']},98:{question:'What is circling the Kaaba during pilgrimage called?',answers:['Tawaf','Sajdah','Ruku','Khutbah']},99:{question:'Between which two hills is Sa\'y performed during Hajj and Umrah?',answers:['Safa and Marwa','Arafat and Mina','Uhud and Hira','Muzdalifah and Mina']},100:{question:'What is the migration of Prophet Muhammad from Mecca to Medina called?',answers:['Hijra','Isra','Hajj','Umrah']},101:{question:'Which angel brought the revelation to Prophet Muhammad?',answers:['Jibril','Mikail','Israfil','Malik']},102:{question:'What is the prostration in prayer called?',answers:['Sujud','Ruku','Qiyam','Salam']},103:{question:'What is the bowing position in prayer called?',answers:['Ruku','Sujud','Adhan','Tawaf']},104:{question:'Which prophet built the foundations of the Kaaba together with his son Ismail?',answers:['Ibrahim','Musa','Nuh','Yusuf']},105:{question:'Who is the father of Prophet Yusuf?',answers:['Yaqub','Ibrahim','Musa','Harun']},106:{question:'Which prophet is associated with the Ark and the great flood?',answers:['Nuh','Yunus','Dawud','Sulayman']},107:{question:'Which prophet was swallowed by a great fish?',answers:['Yunus','Yusuf','Ayyub','Zakariya']},108:{question:'What is the Friday prayer called?',answers:['Jumu\'ah','Witr','Tarawih','Duha']},109:{question:'Which prayer direction is called the Qibla?',answers:['Direction of the Kaaba','Direction of Medina','Direction east','Direction of the nearest minaret']},110:{question:'In which month does Hajj take place?',answers:['Dhu al-Hijjah','Ramadan','Safar','Rajab']},111:{question:'What is the federal capital of Austria?',answers:['Graz','Vienna','Salzburg','Linz']},112:{question:'How many federal states does Austria have?',answers:['7','8','9','10']},113:{question:'Which Austrian federal state is the largest by area?',answers:['Tyrol','Styria','Lower Austria','Upper Austria']},114:{question:'Which river flows through Vienna and Linz?',answers:['Inn','Mur','Danube','Salzach']},115:{question:'What is the highest mountain in Austria?',answers:['Dachstein','Grossglockner','Wildspitze','Grossvenediger']},116:{question:'Which federal state has Innsbruck as its capital?',answers:['Vorarlberg','Tyrol','Carinthia','Salzburg']},117:{question:'What is the capital of Styria?',answers:['Graz','Klagenfurt','Eisenstadt','St. Pölten']},118:{question:'What is the capital of Lower Austria?',answers:['Vienna','St. Pölten','Krems','Wiener Neustadt']},119:{question:'Which federal state is in the far west of Austria?',answers:['Vorarlberg','Burgenland','Vienna','Carinthia']},120:{question:'Which currency does Austria use?',answers:['Franc','Euro','Crown','Schilling']},121:{question:'Since which year has Austria been a member of the European Union?',answers:['1989','1995','2002','2007']},122:{question:'What colors are on the Austrian federal flag?',answers:['Red-White-Red','Black-Red-Gold','Red-White-Blue','Green-White-Green']},123:{question:'What is the capital of Carinthia?',answers:['Villach','Klagenfurt','Bregenz','Lienz']},124:{question:'What is the capital of Burgenland?',answers:['Eisenstadt','Rust','Mattersburg','Oberwart']},125:{question:'What is the capital of Vorarlberg?',answers:['Dornbirn','Feldkirch','Bregenz','Bludenz']},126:{question:'Which famous composer was born in Salzburg in 1756?',answers:['Mozart','Beethoven','Haydn','Schubert']},127:{question:'What is the famous palace in Vienna that served as the Habsburgs\' summer residence?',answers:['Belvedere','Schönbrunn','Hofburg','Mirabell']},128:{question:'Which lake lies partly in Austria and partly in Hungary?',answers:['Wörthersee','Lake Neusiedl','Attersee','Traunsee']},129:{question:'What is the capital of Upper Austria?',answers:['Linz','Wels','Steyr','Ried']},130:{question:'Which city is the capital of the federal state of Salzburg?',answers:['Salzburg','Hallein','Zell am See','Saalfelden']},131:{question:'How many member states does the European Union have?',answers:['25','27','28','30']},132:{question:'Which currency is used by many, but not all, EU member states?',answers:['Euro','Pound','Franc','Crown']},133:{question:'In which city is the European Commission headquartered?',answers:['Strasbourg','Brussels','Luxembourg','Frankfurt']},134:{question:'Which EU institution is directly elected by citizens?',answers:['European Parliament','European Commission','European Council','European Central Bank']},135:{question:'How often are regular European Parliament elections held?',answers:['Every 3 years','Every 4 years','Every 5 years','Every 6 years']},136:{question:'Which country left the European Union in 2020?',answers:['Norway','United Kingdom','Switzerland','Iceland']},137:{question:'Which city is home to the European Central Bank?',answers:['Brussels','Frankfurt am Main','Paris','Luxembourg']},138:{question:'How many stars are on the flag of the European Union?',answers:['10','12','15','27']},139:{question:'What does EU stand for?',answers:['European Union','European Unity','Euro Union','European University']},140:{question:'Which institution generally proposes new EU legislation?',answers:['European Commission','European Central Bank','European Court of Auditors','Court of Justice of the European Union']},141:{question:'Which two institutions jointly adopt most EU legislation?',answers:['European Parliament and Council of the EU','Commission and ECB','European Council and CJEU','CJEU and Court of Auditors']},142:{question:'Which court ensures the uniform interpretation of EU law?',answers:['Court of Justice of the European Union','International Criminal Court','European Court of Auditors','Council of Europe']},143:{question:'Which treaty entered into force in 1993 and established the European Union?',answers:['Maastricht Treaty','Treaty of Versailles','Schengen Agreement','Treaty of Rome 2004']},144:{question:'What are the four freedoms of the EU single market?',answers:['Goods, people, services and capital','Travel, housing, education and culture','Work, leisure, sport and trade','Taxes, currency, military and police']},145:{question:'Is the euro the official currency in every EU member state?',answers:['Yes, in all of them','No','Only outside the EU','Only in founding states']},146:{question:'Which country is an EU member but does not use the euro?',answers:['Poland','Austria','France','Portugal']},147:{question:'Which institution consists of the heads of state or government of the EU member states?',answers:['European Council','European Commission','European Parliament','European Central Bank']},148:{question:'In which city are the European Parliament\'s monthly plenary sessions generally held?',answers:['Strasbourg','Berlin','Vienna','Madrid']},149:{question:'What is the Schengen Area mainly?',answers:['An area without regular checks on people at many shared internal borders','A common EU army','An EU tax zone','A common university']},150:{question:'Which country belongs to the EU?',answers:['Austria','Switzerland','Norway','Iceland']},151:{question:'Which expression using four 4s equals 20?',answers:['(4 + 4 ÷ 4) × 4','4 + 4 + 4 + 4','4 × 4 + 4 + 4','44 ÷ 4 + 4']},152:{question:'How old were you when you were little?',answers:['Older than today','Younger than today','Exactly the same age as today','Always 10']},153:{question:'What gets bigger the more you take away from it?',answers:['A hole','A stone','A glass','A shadow']},154:{question:'What has a neck but no head?',answers:['A bottle','A table','A shoe','A window']},155:{question:'What gets wet while it dries?',answers:['A towel','A candle','A mirror','A book']},156:{question:'What has cities but no houses, and rivers but no water?',answers:['A map','A television','A calendar','A dictionary']},157:{question:'You overtake the person in 2nd place. What place are you in now?',answers:['1st','2nd','3rd','Last']},158:{question:'A farmer has 17 sheep. 9 run away. How many remain?',answers:['8','9','17','26']},159:{question:'What number comes next: 2, 4, 8, 16, ...?',answers:['20','24','30','32']},160:{question:'Which is heavier: 1 kg of feathers or 1 kg of iron?',answers:['The feathers','The iron','They weigh the same','It depends on the color']},161:{question:'5 machines make 5 items in 5 minutes. How long do 100 machines take to make 100 items?',answers:['5 minutes','20 minutes','100 minutes','500 minutes']},162:{question:'You have 3 apples and take 2 of them. How many apples do you have?',answers:['1','2','3','5']},163:{question:'How many months have at least 28 days?',answers:['1','2','6','12']},164:{question:'What is 15 + 6 ÷ 3?',answers:['7','17','21','27']},165:{question:'What is 25% of 80?',answers:['10','20','25','40']},166:{question:'What is three quarters of 100?',answers:['25','50','75','80']},167:{question:'An item costs €50 and is 20% off. What is the new price?',answers:['€30','€35','€40','€45']},168:{question:'You have 12 eggs. 3 break, are fried, and eaten. How many whole eggs remain?',answers:['3','6','9','12']},169:{question:'If yesterday was Sunday, what day is tomorrow?',answers:['Monday','Tuesday','Wednesday','Saturday']},170:{question:'A clock shows exactly 3:00. What is the smaller angle between the hands?',answers:['45°','60°','90°','180°']},171:{question:'Which emergency number works across all EU countries?',answers:['110','112','118','911']},172:{question:'What is a smoke alarm designed to detect?',answers:['Smoke from a fire','Water loss','Electricity prices','Internet outages']},173:{question:'What makes carbon monoxide especially dangerous?',answers:['It is colorless and odorless','It glows blue','It smells strongly sweet','It freezes at room temperature']},174:{question:'What should you never use on burning cooking oil?',answers:['Water','A suitable lid','A fire blanket','An appropriate fire extinguisher']},175:{question:'What is a common warning sign of phishing?',answers:['An urgent request to open a link immediately','An expected invoice from a known retailer','A locally stored file','A normal calendar event']},176:{question:'Which password practice is safest?',answers:['Use the same password everywhere','Use a long, unique password for each account','Use only your first name','Send passwords by chat']},177:{question:'What is two-factor authentication for?',answers:['It speeds up the internet','It requires a second proof when signing in','It deletes old passwords','It creates backups']},178:{question:'What is a backup for?',answers:['To restore data after loss or damage','To make the screen brighter','To speed up Wi-Fi','To store passwords publicly']},179:{question:'What is the fairest way to compare food prices?',answers:['Price per kilogram or liter','Only the package color','Only the total price','Only the brand']},180:{question:'Why can a receipt be important?',answers:['As proof of purchase and for complaints/returns','It automatically extends the warranty','It replaces your ID','It lowers electricity use']},181:{question:'Why does a circuit breaker trip?',answers:['To protect against excessive current or faults','To save Wi-Fi','To stop water','To lock windows']},182:{question:'Why should a power strip not be overloaded?',answers:['It can overheat and cause a fire','The internet gets slower','The lamp gets brighter','The refrigerator gets colder']},183:{question:'What is the safest way to thaw frozen food?',answers:['In the refrigerator','On a radiator','In direct sunlight','Overnight on the counter']},184:{question:'About how long should thorough handwashing with soap take?',answers:['5 seconds','10 seconds','At least about 20 seconds','2 minutes']},185:{question:'How do you reduce cross-contamination in the kitchen?',answers:['Keep raw meat separate from ready-to-eat food','Cut everything on the same unwashed board','Store raw meat above salad','Use the same unwashed knife']},186:{question:'What does a use-by date mean compared with a best-before date?',answers:['It is more directly related to food safety','It is only decorative','It shows the price','It applies only to drinks']},187:{question:'Which foods typically provide plenty of fiber?',answers:['Whole grains and legumes','Sugar and soda','Butter and oil','Salt and water']},188:{question:'Which food group is a typical source of protein?',answers:['Legumes','Sugar','Mineral water','Salt']},189:{question:'At about what temperature does water boil at sea level?',answers:['0 °C','50 °C','100 °C','150 °C']},190:{question:'What does SPF on sunscreen mainly indicate?',answers:['Protection against UVB radiation','Protection against cold','Water hardness','Vitamin D content']},191:{question:'What does a high UV index mean?',answers:['Stronger UV exposure and greater need for protection','Less solar radiation','Safe sunbathing without protection','Low humidity']},192:{question:'Who should wear a seat belt in a car?',answers:['All occupants','Only the driver','Only front-seat passengers','Only children']},193:{question:'What generally happens to braking distance at higher speed?',answers:['It becomes longer','It always becomes shorter','It stays the same','It disappears']},194:{question:'When is tire pressure best checked?',answers:['When the tires are as cold as possible','Right after a long highway drive','Only in rain','Only in winter']},195:{question:'What is the best general response to aquaplaning?',answers:['Ease off the accelerator and avoid sudden steering','Accelerate hard','Jerk the steering wheel','Pull the handbrake']},196:{question:'What does a red traffic light mean?',answers:['Stop','Accelerate','Only honk','Always turn right']},197:{question:'Why are mirrors not always enough when changing lanes?',answers:['Because of the blind spot','Because mirrors do not show colors','Because they work only at night','Because they slow the car down']},198:{question:'What takes priority if navigation instructions conflict with road signs?',answers:['Valid road signs','Always the navigation app','Always the shorter route','The music app']},199:{question:'Where is north on most maps if not stated otherwise?',answers:['At the top','At the bottom','On the left','On the right']},200:{question:'What does UTC refer to?',answers:['A global time reference','A currency','A type of electricity','A file format']},201:{question:'At about what Celsius temperature does pure water freeze?',answers:['-10 °C','0 °C','10 °C','100 °C']},202:{question:'What time is 18:30 in the 12-hour clock?',answers:['6:30 AM','6:30 PM','8:30 PM','5:30 PM']},203:{question:'How do you calculate the area of a rectangle?',answers:['Length × width','Length + width','2 × length','Width ÷ length']},204:{question:'What is 10% of 80?',answers:['4','8','10','16']},205:{question:'What is the average of 10, 20, and 30?',answers:['15','20','25','30']},206:{question:'What is BCC used for in email?',answers:['To hide recipients from one another','To compress a file','To enlarge the font','To delete emails automatically']},207:{question:'Which file format is commonly used for documents that should look the same across devices?',answers:['PDF','MP3','JPG','EXE']},208:{question:'What is Bluetooth typically used for?',answers:['Short-range wireless connections','Satellite navigation','Power generation','Cloud backup without a network']},209:{question:'What is RAM mainly used for in a computer?',answers:['Temporary working memory for running programs','Permanent paper storage','Internet contract','Screen lighting']},210:{question:'What does a browser cache mainly store?',answers:['Temporary website data to load pages faster','Banknotes','SIM cards','GPS satellites']},211:{question:'What does compound interest mean?',answers:['Interest is also earned or charged on previous interest','Interest disappears each year','Only fees earn interest','The interest rate is always zero']},212:{question:'What is usually more informative for comparing loans than the nominal borrowing rate alone?',answers:['The annual percentage rate/effective annual rate','The color of the bank card','The account number','The branch size']},213:{question:'What is a real return?',answers:['Return after accounting for inflation','Return before fees and inflation','Dividends only','Account balance only']},214:{question:'What is the main purpose of diversification when investing?',answers:['To spread risk across different investments','To eliminate every possibility of loss','To buy only one stock','To avoid all taxes']},215:{question:'Why can a nearly correct web address be dangerous?',answers:['It may lead to a fake phishing site','It automatically improves security','It makes the site faster','It is always official']},216:{question:'What is a key benefit of a password manager?',answers:['It can securely manage strong, unique passwords','It publishes passwords','It replaces every backup','It prevents every kind of fraud']},217:{question:'What does end-to-end encryption generally mean?',answers:['Only the communicating endpoints should be able to read the content','Every server can read the content openly','Messages are public','Passwords no longer exist']},218:{question:'What information can photo metadata contain?',answers:['Capture time and possibly location data','Only the phone color','Only the battery level','Always the bank account']},219:{question:'What can a VPN not guarantee?',answers:['Complete anonymity on the internet','An encrypted connection to the VPN provider','A different visible IP address','Protection on the local network path']},220:{question:'What does private/incognito mode normally not hide?',answers:['Your traffic from your ISP or employer network','Local browsing history after closing','Session cookies after closing','Form data from the session']},221:{question:'What is a checksum used for with a file?',answers:['To check whether the file has changed','To enlarge the file','To translate the content','To print it']},222:{question:'What does ransomware typically do?',answers:['It encrypts or locks data and demands money','It improves screen resolution','It lowers electricity costs','It repairs backups']},223:{question:'What does social engineering mean in cybersecurity?',answers:['Manipulating people into giving information or access','Building computer cases','Programming social networks','Only blocking ads']},224:{question:'What does the principle of least privilege mean?',answers:['Give only the permissions that are actually needed','Give everyone administrator rights','Share passwords','Let every app access everything']},225:{question:'A 2 kW device runs for 3 hours. How much energy does it use?',answers:['2 kWh','5 kWh','6 kWh','9 kWh']},226:{question:'What is standby power consumption?',answers:['Electricity used while a device is not actively being used','Electricity used only when switching on','Free electricity','Solar power only']},227:{question:'What does an RCD/GFCI especially help protect against?',answers:['Dangerous residual/fault currents','High internet costs','Empty batteries','Water hardness']},228:{question:'What does a circuit breaker mainly protect against?',answers:['Overcurrent in wiring','Carbon monoxide','Data loss','Tire wear']},229:{question:'What mains voltage is common in many European homes?',answers:['110 V','230 V','4000 V','12 V']},230:{question:'Why does a smoke alarm not replace a carbon monoxide alarm?',answers:['Because they detect different hazards','Because smoke alarms only work outdoors','Because CO is visible','Because CO always smells strong']},231:{question:'What three things make up the classic fire triangle?',answers:['Fuel, oxygen, and heat','Water, sand, and wind','Electricity, metal, and glass','Smoke, light, and noise']},232:{question:'Why is water on burning fat or oil so dangerous?',answers:['It can flash into steam and spread burning oil','It always cools the oil safely','It makes the fire invisible','It only puts out smoke']},233:{question:'Which refrigerator temperature is sensible for many perishable foods?',answers:['About 4 °C','About 15 °C','About 25 °C','About -20 °C']},234:{question:'In which temperature range do many foodborne microbes grow especially well?',answers:['Roughly between 5 °C and 60 °C','Only below -20 °C','Only above 100 °C','Only exactly at 0 °C']},235:{question:'What does cross-contamination mean?',answers:['Germs are transferred from one food or object to another','Food is frozen','Water evaporates','Salt dissolves']},236:{question:'Which statement about a best-before date is correct?',answers:['It mainly concerns quality; food may still be fine afterward','It is always an absolute safety deadline','Every product becomes poisonous afterward','It applies only to frozen food']},237:{question:'What does freezing do to many bacteria?',answers:['It stops or slows growth but does not kill them all','It kills all of them for sure','It immediately doubles their number','It turns them into viruses']},238:{question:'Which statement about high blood pressure is correct?',answers:['It can exist for a long time without noticeable symptoms','It always causes severe pain immediately','It is always visible','It affects only athletes']},239:{question:'What does FAST stand for when checking for a possible stroke?',answers:['Face, Arms, Speech, Time','Food, Air, Sleep, Temperature','Feet, Ankles, Skin, Teeth','Fast, Alert, Safe, Talk']},240:{question:'What chest-compression rate is commonly recommended for adults?',answers:['40–60 per minute','60–80 per minute','100–120 per minute','160–180 per minute']},241:{question:'What is generally appropriate for an unconscious person who is breathing normally?',answers:['Recovery position and monitor breathing','Leave them alone','Give them something to drink','Force them to walk']},242:{question:'On a 1:50,000 map, about how far does 1 cm represent in reality?',answers:['50 m','500 m','5 km','50 km']},243:{question:'What does a lower liters-per-100-km figure mean?',answers:['Lower fuel consumption','Higher fuel consumption','A larger engine','Higher tire pressure']},244:{question:'Why is correct tire pressure important?',answers:['For handling, tire wear, and fuel use','Only for tire color','Only for the radio','It has no effect']},245:{question:'Approximately how does braking distance change when speed doubles?',answers:['It stays the same','It doubles','It becomes about four times as long','It halves']},246:{question:'What especially increases the risk of mold indoors?',answers:['Persistently high humidity','Regular ventilation','Dry surfaces','Adequate heating']},247:{question:'When does condensation form especially easily?',answers:['When warm humid air meets a cold surface','When dry air is warmed','When metal is in the shade','Only when it is windy']},248:{question:'What is more important with recurring mold than simply painting over it?',answers:['Find and fix the moisture source','Only use air freshener','Keep windows permanently closed','Put more furniture in front of it']},249:{question:'What does an insurance deductible mean?',answers:['The amount you pay yourself when a covered loss occurs','The monthly rent','The bank transfer fee','The purchase price of the car']},250:{question:'What does opportunity cost mean?',answers:['The value of the best alternative you give up','Cash costs only','Taxes only','Costs with no alternative']}},

};
const localizeQuestion = (q:Question, language:string):Question | null => { if(language==='DE') return q; const translated=QUESTION_TRANSLATIONS[language as QuestionLocale]?.[q.id]; return translated ? {...q,...translated} : null; };

export const HARD_QUESTION_IDS = new Set([22,25,26,27,37,42,46,48,51,52,53,54,57,58,59,63,65,68,69,70,72,73,77,80,83,86,87,88,94,99,100,101,104,105,109,110,113,115,121,126,127,128,133,134,135,136,137,140,141,142,143,144,145,146,147,148,149,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250]);

export const CATEGORIES = [
  'Alle',
  'Allgemeinwissen',
  'Geografie',
  'Wissenschaft',
  'Geschichte',
  'Kultur',
  'Österreich',
  'EU',
  'Islam',
];

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

const defaultProgress: Progress = {
  xp: 0,
  rounds: 0,
  correct: 0,
  bestStreak: 0,
};

const clampInt = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : 0;

const normalizeProgress = (value: unknown): Progress => {
  if (!value || typeof value !== 'object') return defaultProgress;
  const item = value as Partial<Progress>;
  return {
    xp: clampInt(item.xp, 10_000_000),
    rounds: clampInt(item.rounds, 100_000),
    correct: clampInt(item.correct, 1_000_000),
    bestStreak: clampInt(item.bestStreak, 10),
  };
};

type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

const createAudioContext = () => {
  const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
};

const playTone = (context: AudioContext | null, enabled: boolean, correct: boolean) => {
  if (!enabled || !context) return;
  try {
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = correct ? 'sine' : 'square';
    oscillator.frequency.setValueAtTime(correct ? 720 : 210, now);
    oscillator.frequency.exponentialRampToValueAtTime(correct ? 1080 : 145, now + 0.16);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.19);
  } catch {
    // Feedback must never interrupt gameplay.
  }
};

const vibrate = (enabled: boolean, correct: boolean) => {
  if (!enabled) return;
  try {
    if (Capacitor.isNativePlatform()) {
      void Haptics.notification({
        type: correct ? NotificationType.Success : NotificationType.Error,
      });
      return;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(correct ? 55 : [55, 35, 70]);
    }
  } catch {
    // Feedback must never interrupt gameplay.
  }
};

const CategoryIcon = ({ category }: { category: string }) => {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  if (category === 'Alle') return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="4" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/><rect x="4" y="14" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="14" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/></svg>;
  if (category === 'Allgemeinwissen') return <svg {...common}><path d="M9 18h6M10 21h4M8.2 14.6C6.8 13.5 6 11.9 6 10a6 6 0 1 1 12 0c0 1.9-.8 3.5-2.2 4.6-.9.7-1.3 1.3-1.5 2.4h-4.6c-.2-1.1-.6-1.7-1.5-2.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (category === 'Geografie') return <svg {...common}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M3 12h18M12 3c2.2 2.3 3.4 5.3 3.4 9S14.2 18.7 12 21M12 3C9.8 5.3 8.6 8.3 8.6 12S9.8 18.7 12 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  if (category === 'Wissenschaft') return <svg {...common}><circle cx="12" cy="12" r="1.7" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.8" stroke="currentColor" strokeWidth="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" stroke="currentColor" strokeWidth="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" stroke="currentColor" strokeWidth="1.6"/></svg>;
  if (category === 'Geschichte') return <svg {...common}><path d="M4 8h16M6 8V5h12v3M7 8v9M12 8v9M17 8v9M5 17h14M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (category === 'Kultur') return <svg {...common}><path d="M5 5h6v5c0 3-2 5-5 5s-4-2-4-5V5h3ZM13 9h6v5c0 3-2 5-5 5-1.2 0-2.2-.3-3-.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 9h3M15 13h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (category === 'Österreich') return <svg {...common}><path d="M12 4 5 20M12 4l7 16M8 14h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (category === 'EU') return <svg {...common}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6"/><path d="M12 6.2h.01M16.1 7.9h.01M17.8 12h.01M16.1 16.1h.01M12 17.8h.01M7.9 16.1h.01M6.2 12h.01M7.9 7.9h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>;
  return <svg {...common}><path d="M16.5 16.8A7.5 7.5 0 1 1 13.1 4a6.3 6.3 0 1 0 3.4 12.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m17.6 6 .7 1.5 1.7.2-1.2 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.2-1.2 1.7-.2.7-1.5Z" fill="currentColor"/></svg>;
};

function App() {
  const [screen, setScreen] = useState<'start' | 'quiz' | 'result' | 'failed'>('start');
  const [category, setCategory] = useState('Alle');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(20);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestRoundStreak, setBestRoundStreak] = useState(0);
  const [progress, setProgress] = useState<Progress>(() => {
    try {
      const raw = localStorage.getItem('quiz-arena-progress');
      return raw ? normalizeProgress(JSON.parse(raw)) : defaultProgress;
    } catch {
      return defaultProgress;
    }
  });
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('quiz-arena-sound') !== 'off'; } catch { return true; } });
  const [haptics, setHaptics] = useState(() => { try { return localStorage.getItem('quiz-arena-haptics') !== 'off'; } catch { return true; } });
  const [confirmExit, setConfirmExit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [language, setLanguage] = useState(() => { try { return localStorage.getItem('quiz-arena-language')==='EN'?'EN':'DE'; } catch { return 'DE'; } });
  const [theme, setTheme] = useState<'Dunkel' | 'Hell' | 'Auto'>(() => { try { const value = localStorage.getItem('quiz-arena-theme'); return value === 'Dunkel' || value === 'Auto' ? value : 'Hell'; } catch { return 'Hell'; } });
  const [fontSize, setFontSize] = useState<'Klein' | 'Normal' | 'Groß'>(() => { try { const value = localStorage.getItem('quiz-arena-font'); return value === 'Klein' || value === 'Groß' ? value : 'Normal'; } catch { return 'Normal'; } });
  const [questionTime, setQuestionTime] = useState(() => { try { const value = Number(localStorage.getItem('quiz-arena-time')); return [15,20,30].includes(value) ? value : 20; } catch { return 20; } });
  const [roundSize, setRoundSize] = useState(() => { try { const value = Number(localStorage.getItem('quiz-arena-round-size')); return [5,10,15].includes(value) ? value : 10; } catch { return 10; } });
  const [difficulty, setDifficulty] = useState<'easy' | 'hard'>(() => { try { return localStorage.getItem('quiz-arena-difficulty') === 'hard' ? 'hard' : 'easy'; } catch { return 'easy'; } });
  const [wrongCount, setWrongCount] = useState(0);
  const [failReason, setFailReason] = useState<'timeout' | 'mistakes'>('timeout');
  const [appActive, setAppActive] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recentQuestionIdsRef = useRef<Record<string, number[]>>({});
  const UI: Record<string, Record<string,string>> = {
    DE:{difficulty:'Schwierigkeit',easy:'Einfach',easySub:'Fehler erlaubt · Zeitablauf beendet die Runde',hard:'Schwer',hardSub:'2 Fehler oder Zeitablauf = Runde beendet',switchDifficulty:'Tippen zum Wechseln',light:'Hell',dark:'Dunkel',auto:'Auto',small:'Klein',normal:'Normal',large:'Groß',notAvailable:'Auf diesem Gerät nicht verfügbar',failed:'RUNDE BEENDET',timeoutFail:'Die Zeit ist abgelaufen.',mistakesFail:'Du hast im schweren Modus zweimal falsch geantwortet.',restart:'Von vorne starten',correctLabel:'RICHTIG',levelLabel:'LEVEL',languageLabel:'Sprache',tag:'Wissen. Spielen. Besser werden.',challenge:'Bereit für eine neue Herausforderung?',play:'Spiel starten',stats:'Meine Statistik',settings:'Einstellungen',sound:'Ton',soundSub:'Soundeffekte',vibration:'Vibration',vibrationSub:'Bei Antippen',design:'Design',font:'Schriftgröße',timer:'Timer pro Frage',round:'Fragen pro Runde',statistics:'Statistiken',achievements:'Erfolge',about:'Über die App',privacy:'Datenschutz',privacyText:'Kein Name, keine Adresse, kein Passwort. Spielstand nur lokal.',imprint:'Impressum',imprintText:'Betreiberangaben werden vor Veröffentlichung ergänzt.',reset:'Fortschritt zurücksetzen',safe:'Sicher & anonym',questions:'Fragen',seconds:'Sekunden',rounds:'Runden',correct:'richtig',badges:'Abzeichen',question:'FRAGE',points:'P',streak:'Serie',next:'Weiter',result:'Ergebnis ansehen',finished:'RUNDE BEENDET',accuracy:'GENAUIGKEIT',best:'BESTE SERIE',progress:'Dein Fortschritt',totalXp:'XP gesamt',again:'Noch eine Runde',home:'Zur Startseite',leaveTitle:'Runde verlassen?',leaveText:'Dein aktueller Fortschritt dieser Runde geht verloren. Der Timer ist währenddessen pausiert.',continue:'Weiterspielen',leave:'Runde verlassen'},
    EN:{difficulty:'Difficulty',easy:'Easy',easySub:'Mistakes allowed · timeout ends the round',hard:'Hard',hardSub:'2 mistakes or timeout = round over',switchDifficulty:'Tap to switch',light:'Light',dark:'Dark',auto:'Auto',small:'Small',normal:'Normal',large:'Large',notAvailable:'Not available on this device',failed:'ROUND OVER',timeoutFail:'Time ran out.',mistakesFail:'You answered incorrectly twice in Hard mode.',restart:'Restart from the beginning',correctLabel:'CORRECT',levelLabel:'LEVEL',languageLabel:'Language',tag:'Learn. Play. Improve.',challenge:'Ready for a new challenge?',play:'Start game',stats:'My statistics',settings:'Settings',sound:'Sound',soundSub:'Sound effects',vibration:'Vibration',vibrationSub:'On tap',design:'Theme',font:'Font size',timer:'Time per question',round:'Questions per round',statistics:'Statistics',achievements:'Achievements',about:'About the app',privacy:'Privacy',privacyText:'No name, address or password. Progress stays on this device.',imprint:'Legal notice',imprintText:'Operator details will be added before publication.',reset:'Reset progress',safe:'Safe & anonymous',questions:'questions',seconds:'seconds',rounds:'rounds',correct:'correct',badges:'badges',question:'QUESTION',points:'PTS',streak:'Streak',next:'Next',result:'View results',finished:'ROUND COMPLETE',accuracy:'ACCURACY',best:'BEST STREAK',progress:'Your progress',totalXp:'total XP',again:'Play again',home:'Home',leaveTitle:'Leave round?',leaveText:'Your progress in this round will be lost. The timer is paused while this dialog is open.',continue:'Continue',leave:'Leave round'},
    RU:{correctLabel:'ПРАВИЛЬНО',levelLabel:'УРОВЕНЬ',languageLabel:'Язык',tag:'Учись. Играй. Становись лучше.',challenge:'Готовы к новому испытанию?',play:'Начать игру',stats:'Моя статистика',settings:'Настройки',sound:'Звук',soundSub:'Звуковые эффекты',vibration:'Вибрация',vibrationSub:'При нажатии',design:'Тема',font:'Размер шрифта',timer:'Время на вопрос',round:'Вопросов в раунде',statistics:'Статистика',achievements:'Достижения',about:'О приложении',privacy:'Конфиденциальность',privacyText:'Без имени, адреса и пароля. Прогресс хранится только на устройстве.',imprint:'Правовая информация',imprintText:'Данные оператора будут добавлены перед публикацией.',reset:'Сбросить прогресс',safe:'Безопасно и анонимно',questions:'вопросов',seconds:'секунд',rounds:'раундов',correct:'верно',badges:'наград',question:'ВОПРОС',points:'ОЧК',streak:'Серия',next:'Далее',result:'Результаты',finished:'РАУНД ЗАВЕРШЁН',accuracy:'ТОЧНОСТЬ',best:'ЛУЧШАЯ СЕРИЯ',progress:'Ваш прогресс',totalXp:'XP всего',again:'Ещё раунд',home:'На главную',leaveTitle:'Выйти из раунда?',leaveText:'Прогресс текущего раунда будет потерян. Таймер сейчас остановлен.',continue:'Продолжить',leave:'Выйти'},
    TR:{correctLabel:'DOĞRU',levelLabel:'SEVİYE',languageLabel:'Dil',tag:'Öğren. Oyna. Geliş.',challenge:'Yeni bir mücadeleye hazır mısın?',play:'Oyunu başlat',stats:'İstatistiklerim',settings:'Ayarlar',sound:'Ses',soundSub:'Ses efektleri',vibration:'Titreşim',vibrationSub:'Dokununca',design:'Tema',font:'Yazı boyutu',timer:'Soru süresi',round:'Tur başına soru',statistics:'İstatistikler',achievements:'Başarılar',about:'Uygulama hakkında',privacy:'Gizlilik',privacyText:'İsim, adres veya parola yok. İlerleme yalnızca cihazda kalır.',imprint:'Yasal bilgiler',imprintText:'Yayın öncesinde işletmeci bilgileri eklenecektir.',reset:'İlerlemeyi sıfırla',safe:'Güvenli ve anonim',questions:'soru',seconds:'saniye',rounds:'tur',correct:'doğru',badges:'rozet',question:'SORU',points:'P',streak:'Seri',next:'İleri',result:'Sonuçları gör',finished:'TUR BİTTİ',accuracy:'DOĞRULUK',best:'EN İYİ SERİ',progress:'İlerlemen',totalXp:'toplam XP',again:'Tekrar oyna',home:'Ana sayfa',leaveTitle:'Turdan çık?',leaveText:'Bu turdaki ilerlemen kaybolacak. Bu pencere açıkken süre durur.',continue:'Devam et',leave:'Turdan çık'},
    FR:{correctLabel:'CORRECT',levelLabel:'NIVEAU',languageLabel:'Langue',tag:'Apprendre. Jouer. Progresser.',challenge:'Prêt pour un nouveau défi ?',play:'Commencer',stats:'Mes statistiques',settings:'Paramètres',sound:'Son',soundSub:'Effets sonores',vibration:'Vibration',vibrationSub:'Au toucher',design:'Thème',font:'Taille du texte',timer:'Temps par question',round:'Questions par manche',statistics:'Statistiques',achievements:'Succès',about:"À propos de l’app",privacy:'Confidentialité',privacyText:'Aucun nom, adresse ou mot de passe. La progression reste sur cet appareil.',imprint:'Mentions légales',imprintText:'Les informations de l’exploitant seront ajoutées avant publication.',reset:'Réinitialiser la progression',safe:'Sûr et anonyme',questions:'questions',seconds:'secondes',rounds:'manches',correct:'correctes',badges:'badges',question:'QUESTION',points:'PTS',streak:'Série',next:'Suivant',result:'Voir les résultats',finished:'MANCHE TERMINÉE',accuracy:'PRÉCISION',best:'MEILLEURE SÉRIE',progress:'Votre progression',totalXp:'XP au total',again:'Rejouer',home:'Accueil',leaveTitle:'Quitter la manche ?',leaveText:'La progression de cette manche sera perdue. Le minuteur est en pause.',continue:'Continuer',leave:'Quitter'},
    AR:{correctLabel:'صحيح',levelLabel:'المستوى',languageLabel:'اللغة',tag:'تعلّم. العب. تطوّر.',challenge:'هل أنت مستعد لتحدٍ جديد؟',play:'ابدأ اللعب',stats:'إحصائياتي',settings:'الإعدادات',sound:'الصوت',soundSub:'المؤثرات الصوتية',vibration:'الاهتزاز',vibrationSub:'عند اللمس',design:'المظهر',font:'حجم الخط',timer:'وقت السؤال',round:'أسئلة كل جولة',statistics:'الإحصائيات',achievements:'الإنجازات',about:'حول التطبيق',privacy:'الخصوصية',privacyText:'لا اسم ولا عنوان ولا كلمة مرور. التقدم محفوظ على هذا الجهاز فقط.',imprint:'المعلومات القانونية',imprintText:'ستضاف بيانات المشغل قبل النشر.',reset:'إعادة ضبط التقدم',safe:'آمن ومجهول',questions:'أسئلة',seconds:'ثانية',rounds:'جولات',correct:'صحيح',badges:'شارات',question:'السؤال',points:'ن',streak:'السلسلة',next:'التالي',result:'عرض النتائج',finished:'انتهت الجولة',accuracy:'الدقة',best:'أفضل سلسلة',progress:'تقدمك',totalXp:'XP إجمالي',again:'جولة أخرى',home:'الرئيسية',leaveTitle:'مغادرة الجولة؟',leaveText:'سيُفقد تقدم هذه الجولة. المؤقت متوقف أثناء فتح هذه النافذة.',continue:'متابعة',leave:'مغادرة'},
    BS:{correctLabel:'TAČNO',levelLabel:'NIVO',languageLabel:'Jezik',tag:'Uči. Igraj. Napreduj.',challenge:'Spreman za novi izazov?',play:'Pokreni igru',stats:'Moja statistika',settings:'Postavke',sound:'Zvuk',soundSub:'Zvučni efekti',vibration:'Vibracija',vibrationSub:'Pri dodiru',design:'Tema',font:'Veličina teksta',timer:'Vrijeme po pitanju',round:'Pitanja po rundi',statistics:'Statistika',achievements:'Dostignuća',about:'O aplikaciji',privacy:'Privatnost',privacyText:'Bez imena, adrese i lozinke. Napredak ostaje samo na uređaju.',imprint:'Pravne informacije',imprintText:'Podaci operatera bit će dodani prije objave.',reset:'Resetuj napredak',safe:'Sigurno i anonimno',questions:'pitanja',seconds:'sekundi',rounds:'rundi',correct:'tačno',badges:'znački',question:'PITANJE',points:'B',streak:'Niz',next:'Dalje',result:'Prikaži rezultat',finished:'RUNDA ZAVRŠENA',accuracy:'TAČNOST',best:'NAJBOLJI NIZ',progress:'Tvoj napredak',totalXp:'XP ukupno',again:'Još jedna runda',home:'Početna',leaveTitle:'Napustiti rundu?',leaveText:'Napredak ove runde će biti izgubljen. Tajmer je pauziran.',continue:'Nastavi',leave:'Napusti'}
  };
  const t = UI[language] || UI.DE;
  const CATEGORY_LABELS: Record<string, Record<string,string>> = { DE:{Alle:'Alle',Allgemeinwissen:'Allgemeinwissen',Geografie:'Geografie',Wissenschaft:'Wissenschaft',Kultur:'Kultur',Geschichte:'Geschichte','Österreich':'Österreich',EU:'EU',Islam:'Islam'}, EN:{Alle:'All',Allgemeinwissen:'General Knowledge',Geografie:'Geography',Wissenschaft:'Science',Kultur:'Culture',Geschichte:'History','Österreich':'Austria',EU:'EU',Islam:'Islam'}, RU:{Alle:'Все',Geografie:'География',Wissenschaft:'Наука',Kultur:'Культура',Geschichte:'История','Österreich':'Австрия',EU:'ЕС',Islam:'Ислам'}, TR:{Alle:'Tümü',Geografie:'Coğrafya',Wissenschaft:'Bilim',Kultur:'Kültür',Geschichte:'Tarih','Österreich':'Avusturya',EU:'AB',Islam:'İslam'}, FR:{Alle:'Toutes',Geografie:'Géographie',Wissenschaft:'Sciences',Kultur:'Culture',Geschichte:'Histoire','Österreich':'Autriche',EU:'UE',Islam:'Islam'}, AR:{Alle:'الكل',Geografie:'الجغرافيا',Wissenschaft:'العلوم',Kultur:'الثقافة',Geschichte:'التاريخ','Österreich':'النمسا',EU:'الاتحاد الأوروبي',Islam:'الإسلام'}, BS:{Alle:'Sve',Geografie:'Geografija',Wissenschaft:'Nauka',Kultur:'Kultura',Geschichte:'Historija','Österreich':'Austrija',EU:'EU',Islam:'Islam'} };
  const categoryLabel = (key:string) => (CATEGORY_LABELS[language] || CATEGORY_LABELS.DE)[key] || key;
  const setAppLanguage = (code:string) => { if (!UI[code]) return; setLanguage(code); try { localStorage.setItem('quiz-arena-language', code); } catch {} };

  const ensureAudio = () => {
    if (!sound) return null;
    if (!audioContextRef.current) audioContextRef.current = createAudioContext();
    if (audioContextRef.current?.state === 'suspended') void audioContextRef.current.resume();
    return audioContextRef.current;
  };

  const vibrationSupported = Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && 'vibrate' in navigator);
  const resolvedDark = theme === 'Dunkel' || (theme === 'Auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const setDifficultyValue = (value: 'easy' | 'hard') => { setDifficulty(value); try { localStorage.setItem('quiz-arena-difficulty', value); } catch {} };
  const toggleDifficulty = () => setDifficultyValue(difficulty === 'hard' ? 'easy' : 'hard');
  const current = questions[index];
  const isNativeApp = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNativeApp) return undefined;

    let listener: { remove: () => Promise<void> } | undefined;
    let disposed = false;

    CapacitorApp.addListener('backButton', () => {
      if (confirmExit) {
        setConfirmExit(false);
      } else if (menuOpen) {
        setMenuOpen(false);
      } else if (screen === 'quiz') {
        setConfirmExit(true);
      } else if (screen === 'result' || screen === 'failed') {
        setScreen('start');
      } else {
        void CapacitorApp.exitApp();
      }
    }).then(handle => {
      if (disposed) {
        void handle.remove();
      } else {
        listener = handle;
      }
    });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [isNativeApp, confirmExit, menuOpen, screen]);

  useEffect(() => {
    if (!isNativeApp) return undefined;

    let listener: { remove: () => Promise<void> } | undefined;
    let disposed = false;

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      setAppActive(isActive);
    }).then(handle => {
      if (disposed) {
        void handle.remove();
      } else {
        listener = handle;
      }
    });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [isNativeApp]);
  const level = Math.floor(progress.xp / 500) + 1;
  const xpIntoLevel = progress.xp % 500;
  const accuracy = answers.length
    ? Math.round((answers.filter(Boolean).length / answers.length) * 100)
    : 0;

  const achievements = useMemo(
    () => [
      { label: 'Erste Runde', unlocked: progress.rounds >= 1 },
      { label: '10 Runden', unlocked: progress.rounds >= 10 },
      { label: '50 richtig', unlocked: progress.correct >= 50 },
      { label: '5er-Serie', unlocked: progress.bestStreak >= 5 },
      { label: 'Level 5', unlocked: level >= 5 },
    ],
    [progress, level]
  );

  useEffect(() => {
    if (screen !== 'quiz' || selected !== null || confirmExit || !appActive) return;
    if (seconds <= 0) {
      setFailReason('timeout');
      setScreen('failed');
      return;
    }
    const timer = window.setTimeout(() => setSeconds(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, selected, screen, confirmExit, appActive]);

  useEffect(() => {
    localStorage.setItem('quiz-arena-progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    try {
      localStorage.setItem('quiz-arena-sound', sound ? 'on' : 'off');
      localStorage.setItem('quiz-arena-haptics', haptics ? 'on' : 'off');
      localStorage.setItem('quiz-arena-theme', theme);
      localStorage.setItem('quiz-arena-font', fontSize);
      localStorage.setItem('quiz-arena-time', String(questionTime));
      localStorage.setItem('quiz-arena-round-size', String(roundSize));
    } catch {}
  }, [sound, haptics, theme, fontSize, questionTime, roundSize]);

  useEffect(() => {
    document.documentElement.dataset.quizTheme = resolvedDark ? 'dark' : 'light';
    return () => { delete document.documentElement.dataset.quizTheme; };
  }, [resolvedDark]);

  const startRound = () => {
    const pool =
      category === 'Alle'
        ? QUESTIONS
        : QUESTIONS.filter(q => q.category === category);
    const localizedPoolAll = language === 'DE' ? pool : pool.map(q => localizeQuestion(q, language)).filter((q): q is Question => q !== null);
    const localizedPool = localizedPoolAll.filter(q => difficulty === 'hard' ? HARD_QUESTION_IDS.has(q.id) : !HARD_QUESTION_IDS.has(q.id));
    const historyKey = `${language}:${difficulty}:${category}`;
    const recentIds = new Set(recentQuestionIdsRef.current[historyKey] || []);
    const unseen = localizedPool.filter(q => !recentIds.has(q.id));
    const desired = Math.min(roundSize, localizedPool.length);
    const picked = shuffle(unseen).slice(0, desired);
    if (picked.length < desired) {
      const pickedIds = new Set(picked.map(q => q.id));
      const recycled = shuffle(localizedPool.filter(q => !pickedIds.has(q.id))).slice(0, desired - picked.length);
      picked.push(...recycled);
    }
    if (!picked.length) return;
    const nextHistory = [...(recentQuestionIdsRef.current[historyKey] || []), ...picked.map(q => q.id)];
    recentQuestionIdsRef.current[historyKey] = nextHistory.slice(-Math.max(desired, localizedPool.length - desired));
    setQuestions(picked);
    setIndex(0);
    setSeconds(questionTime);
    setSelected(null);
    setAnswers([]);
    setScore(0);
    setStreak(0);
    setBestRoundStreak(0);
    setWrongCount(0);
    setConfirmExit(false);
    setScreen('quiz');
  };

  const chooseAnswer = (answerIndex: number) => {
    if (!current || selected !== null || confirmExit) return;
    const correct = answerIndex === current.correct;
    const nextStreak = correct ? streak + 1 : 0;
    if (correct) {
      const gained =
        100 + seconds * 5 + Math.min(Math.max(nextStreak - 1, 0), 4) * 25;
      setScore(value => value + gained);
    }
    setStreak(nextStreak);
    setBestRoundStreak(value => Math.max(value, nextStreak));
    setAnswers(prev => [...prev, correct]);
    setSelected(answerIndex);
    if (!correct) {
      const nextWrongCount = wrongCount + 1;
      setWrongCount(nextWrongCount);
      if (difficulty === 'hard' && nextWrongCount >= 2) {
        setFailReason('mistakes');
        window.setTimeout(() => setScreen('failed'), 280);
      }
    }
    playTone(ensureAudio(), sound, correct);
    vibrate(haptics, correct);
  };

  const next = () => {
    if (selected === null) return;
    if (index === questions.length - 1) {
      const correctCount = answers.filter(Boolean).length;
      const xp = correctCount * 50 + Math.floor(score / 20);
      setProgress(prev => ({
        xp: prev.xp + xp,
        rounds: prev.rounds + 1,
        correct: prev.correct + correctCount,
        bestStreak: Math.max(prev.bestStreak, bestRoundStreak),
      }));
      setScreen('result');
      return;
    }
    setIndex(value => value + 1);
    setSeconds(questionTime);
    setSelected(null);
  };

  const resetProgress = () => {
    setProgress(defaultProgress);
    localStorage.removeItem('quiz-arena-progress');
  };

  if (screen === 'start') {
    const languages = [['DE','🇩🇪','Deutsch'],['EN','🇬🇧','English']];
    return (
      <main className={`shell appRoot gameHome font-${fontSize.toLowerCase()}`}>
        <header className="homeTop"><div className="levelBox"><span className="levelBadge">{level}</span><div><strong>Level {level}</strong><div className="progressTrack"><div style={{ width: `${(xpIntoLevel / 500) * 100}%` }} /></div></div><b>{xpIntoLevel} XP</b></div><button className="menuButton" onClick={() => setMenuOpen(true)} aria-label="Menu"><span></span><span></span><span></span></button></header>
        <section className="gameHero"><div className="appMark">Q</div><div><h1>Quiz <em>Arena</em></h1><p>{t.tag}</p></div></section>
        <section className="panel categoryPanel">
          <div className="categoryHeading"><div><h2>{language === 'DE' ? 'Kategorie wählen' : 'Choose a category'}</h2><p>{language === 'DE' ? 'Wähle ein Thema für deine nächste Runde.' : 'Pick a topic for your next round.'}</p></div><button className={`difficultyQuickSwitch ${difficulty}`} onClick={toggleDifficulty} aria-label={`${t.difficulty}: ${difficulty === 'hard' ? t.hard : t.easy}. ${t.switchDifficulty}`}><span className={difficulty === 'easy' ? 'active' : ''}>{t.easy}</span><span className={difficulty === 'hard' ? 'active' : ''}>{t.hard}</span></button></div>
          <div className="categoryList">
            {CATEGORIES.map(item => {
              const eligibleCount = QUESTIONS.filter(q => (item === 'Alle' || q.category === item) && (difficulty === 'hard' ? HARD_QUESTION_IDS.has(q.id) : !HARD_QUESTION_IDS.has(q.id))).length;
              const active = category === item;
              return (
                <button key={item} className={active ? 'categoryRow active' : 'categoryRow'} onClick={() => setCategory(item)} aria-pressed={active}>
                  <span className="categoryIcon"><CategoryIcon category={item} /></span>
                  <span className="categoryName">{categoryLabel(item)}</span>
                  <span className="categoryCount">{eligibleCount}</span>
                  <span className={active ? 'categoryMark selected' : 'categoryMark'}>{active ? '✓' : '›'}</span>
                </button>
              );
            })}
          </div>
        </section>
        <button className="playButton" onClick={() => { ensureAudio(); startRound(); }}><span>▶</span> {t.play} <b>›</b></button>
        <button className="statsButton" onClick={() => setMenuOpen(true)}>▥ <span>{t.stats}</span> <b>›</b></button>

        {menuOpen && <div className="drawerLayer" onClick={() => setMenuOpen(false)}><aside className="drawer" onClick={e => e.stopPropagation()} aria-label={t.settings}><div className="drawerHead"><div><b>♛ Quiz <em>Arena</em></b><small>{t.tag}</small></div><button onClick={() => setMenuOpen(false)}>×</button></div>
          <div className="menuGroup"><h3>🌐 {t.languageLabel}</h3>{languages.map(([code,flag,label]) => <button key={code} className={language===code?'language active':'language'} onClick={()=>setAppLanguage(code)}><span>{flag}</span>{label}<b>{language===code?'✓':''}</b></button>)}</div>
          <div className="menuGroup settings"><h3>⚙ {t.settings}</h3>
            <div className="settingBlock"><div className="settingBlockTitle"><span>◇</span><div><b>{t.difficulty}</b><small>{difficulty === 'hard' ? t.hardSub : t.easySub}</small></div></div><div className="segmented two"><button className={difficulty==='easy'?'active':''} onClick={()=>setDifficultyValue('easy')}>{t.easy}</button><button className={difficulty==='hard'?'active':''} onClick={()=>setDifficultyValue('hard')}>{t.hard}</button></div></div>
            <label className="toggleRow"><span>🔊 <b>{t.sound}</b><small>{t.soundSub}</small></span><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/></label>
            <label className={`toggleRow ${vibrationSupported ? '' : 'disabled'}`}><span>📱 <b>{t.vibration}</b><small>{vibrationSupported ? t.vibrationSub : t.notAvailable}</small></span><input type="checkbox" checked={haptics && vibrationSupported} disabled={!vibrationSupported} onChange={e=>setHaptics(e.target.checked)}/></label>
            <div className="settingBlock"><div className="settingBlockTitle"><span>◐</span><div><b>{t.design}</b><small>{theme === 'Hell' ? t.light : theme === 'Dunkel' ? t.dark : t.auto}</small></div></div><div className="segmented three"><button className={theme==='Hell'?'active':''} onClick={()=>setTheme('Hell')}>{t.light}</button><button className={theme==='Dunkel'?'active':''} onClick={()=>setTheme('Dunkel')}>{t.dark}</button><button className={theme==='Auto'?'active':''} onClick={()=>setTheme('Auto')}>{t.auto}</button></div></div>
            <div className="settingBlock"><div className="settingBlockTitle"><span>AA</span><div><b>{t.font}</b><small>{fontSize === 'Klein' ? t.small : fontSize === 'Groß' ? t.large : t.normal}</small></div></div><div className="segmented three"><button className={fontSize==='Klein'?'active':''} onClick={()=>setFontSize('Klein')}>{t.small}</button><button className={fontSize==='Normal'?'active':''} onClick={()=>setFontSize('Normal')}>{t.normal}</button><button className={fontSize==='Groß'?'active':''} onClick={()=>setFontSize('Groß')}>{t.large}</button></div></div>
            <div className="settingBlock"><div className="settingBlockTitle"><span>◷</span><div><b>{t.timer}</b><small>{questionTime} {t.seconds}</small></div></div><div className="segmented three"><button className={questionTime===15?'active':''} onClick={()=>setQuestionTime(15)}>15</button><button className={questionTime===20?'active':''} onClick={()=>setQuestionTime(20)}>20</button><button className={questionTime===30?'active':''} onClick={()=>setQuestionTime(30)}>30</button></div></div>
            <div className="settingBlock"><div className="settingBlockTitle"><span>☷</span><div><b>{t.round}</b><small>{roundSize} {t.questions}</small></div></div><div className="segmented three"><button className={roundSize===5?'active':''} onClick={()=>setRoundSize(5)}>5</button><button className={roundSize===10?'active':''} onClick={()=>setRoundSize(10)}>10</button><button className={roundSize===15?'active':''} onClick={()=>setRoundSize(15)}>15</button></div></div>
          </div>
          <div className="menuGroup"><button className="menuRow"><span>▥ <b>{t.statistics}</b><small>{progress.rounds} {t.rounds} · {progress.correct} {t.correct}</small></span><b>›</b></button><button className="menuRow"><span>♜ <b>{t.achievements}</b><small>{achievements.filter(a=>a.unlocked).length}/{achievements.length} {t.badges}</small></span><b>›</b></button></div>
          <div className="menuGroup"><div className="menuInfo"><b>ⓘ {t.about}</b><small>Quiz Arena v1.0.0</small></div><div className="menuInfo"><b>⬡ {t.privacy}</b><small>{t.privacyText}</small></div><div className="menuInfo"><b>▤ {t.imprint}</b><small>{t.imprintText}</small></div><button className="resetLink" onClick={resetProgress}>{t.reset}</button></div><footer>{t.safe}</footer>
        </aside></div>}
      </main>
    );
  }

  if (screen === 'failed') {
    return (
      <main className={`shell appRoot result failScreen font-${fontSize.toLowerCase()}`}>
        <div className="trophy">×</div>
        <p className="eyebrow">{t.failed}</p>
        <h1>{failReason === 'timeout' ? t.timeoutFail : t.mistakesFail}</h1>
        <p className="muted">{difficulty === 'hard' ? t.hardSub : t.easySub}</p>
        <button className="primary" onClick={startRound}>{t.restart}</button>
        <button className="ghost wide" onClick={() => setScreen('start')}>{t.home}</button>
      </main>
    );
  }

  if (screen === 'result') {
    const correctCount = answers.filter(Boolean).length;
    return (
      <main className={`shell appRoot result font-${fontSize.toLowerCase()}`}>
        <div className="trophy">★</div>
        <p className="eyebrow">{t.finished}</p>
        <h1>{score} {t.points}</h1>
        <section className="stats resultStats">
          <div>
            <span>{t.correctLabel}</span>
            <strong>{correctCount}/{questions.length}</strong>
          </div>
          <div>
            <span>{t.accuracy}</span>
            <strong>{accuracy}%</strong>
          </div>
          <div>
            <span>{t.best}</span>
            <strong>{bestRoundStreak}</strong>
          </div>
          <div>
            <span>{t.levelLabel}</span>
            <strong>{Math.floor(progress.xp / 500) + 1}</strong>
          </div>
        </section>
        <section className="panel">
          <div className="panelTitle">
            <span>{t.progress}</span>
            <small>{progress.xp} {t.totalXp}</small>
          </div>
          <div className="progressTrack">
            <div style={{ width: `${((progress.xp % 500) / 500) * 100}%` }} />
          </div>
        </section>
        <button className="primary" onClick={startRound}>
          {t.again}
        </button>
        <button className="ghost wide" onClick={() => setScreen('start')}>
          {t.home}
        </button>
      </main>
    );
  }

  if (!current) return null;

  return (
    <main className={`shell appRoot quizShell font-${fontSize.toLowerCase()}`}>
      <header className="quizHeader">
        <div>
          <span>{t.question} {index + 1}/{questions.length}</span>
          <strong>{score} {t.points}</strong>
        </div>
        <button
          className="exit"
          onClick={() => setConfirmExit(true)}
          aria-label={t.leave}
        >
          ×
        </button>
      </header>
      <div className="progressTrack">
        <div style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>
      <section className="questionCard">
        <div className="questionMeta"><p className="eyebrow">{categoryLabel(current.category).toUpperCase()}</p><div className={seconds <= 5 ? 'timer danger' : 'timer'}>{seconds}s</div></div>
        <h2>{current.question}</h2>
        <div className="answers">
          {current.answers.map((answer, answerIndex) => {
            const isCorrect =
              selected !== null && answerIndex === current.correct;
            const isWrong =
              selected === answerIndex && answerIndex !== current.correct;
            const locked = selected !== null || confirmExit;
            const className = `${isCorrect ? 'answer correct' : isWrong ? 'answer wrong' : 'answer'}${locked ? ' locked' : ''}`;
            return (
              <div
                key={answer}
                className={className}
                role="button"
                aria-disabled={locked}
                tabIndex={locked ? -1 : 0}
                onClick={() => { if (!locked) chooseAnswer(answerIndex); }}
                onKeyDown={event => {
                  if (locked) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    chooseAnswer(answerIndex);
                  }
                }}
              >
                <span>{answerIndex + 1}</span>
                {answer}
              </div>
            );
          })}
        </div>
        {selected !== null && (
          <button className="primary" onClick={next}>
            {index === questions.length - 1 ? t.result : t.next}
          </button>
        )}
      </section>
      <div className="streak">{t.streak}: {streak} ⚡</div>

      {confirmExit && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="dialog">
            <h3>{t.leaveTitle}</h3>
            <p>{t.leaveText}</p>
            <button className="primary" onClick={() => setConfirmExit(false)}>
              {t.continue}
            </button>
            <button
              className="ghost wide"
              onClick={() => {
                setConfirmExit(false);
                setScreen('start');
              }}
            >
              {t.leave}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
