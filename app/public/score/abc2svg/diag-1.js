// abc2svg - ABC to SVG translator
// @source: https://chiselapp.com/user/moinejf/repository/abc2svg
// Copyright (C) 2014-2025 Jean-Francois Moine - LGPL3+
// diag.js - module to insert guitar / ukulele chord diagrams
// Registered on modules.hooks for abc2svg 1.22.1 (upstream uses mhooks).
// cd4 is filled with GCEA ukulele shapes; upstream ships an empty table.
// Each diagram is inlined into the staff SVG. abc2svg flushes a new <svg>
// per system and drops <defs>, so a shared <use> paints only on the first line.
if (!abc2svg.diag) {
abc2svg.diag = {
    cd4: {
        C: "0003 ,0 0003",
        Cm: "0333 ,0 0134",
        C7: "0001 ,0 0001",
        Cm7: "3333 ,0 1111",
        CM7: "0002 ,0 0002",
        Csus4: "0013 ,0 0013",
        C6: "0000 ,0 0000",
        Cm6: "1312 fr5 1312 barre=4-2",
        C7sus4: "0011 ,0 0011 barre=2-1",
        Csus2: "0233 ,0 0122",
        Cdim: "4212 fr2 4213",
        Caug: "3221 fr3 3221",
        Cdim7: "1212 fr5 1213 barre=4-2",
        Cm7b5: "1222 fr5 1222",
        "Cm(maj7)": "4221 fr2 3221",
        "C#": "1114 fr1 1114 barre=4-2",
        "C#m": "1444 fr1 1444",
        "C#7": "1112 fr1 1112 barre=4-2",
        "C#m7": "1102 ,0 1102",
        "C#M7": "1113 fr1 1113 barre=4-2",
        "C#sus4": "1124 fr1 1124 barre=4-3",
        "C#6": "1111 fr1 1111 barre=4-1",
        "C#m6": "1101 ,0 1102",
        "C#7sus4": "1122 fr1 1122 barre=4-3",
        "C#sus2": "4122 fr3 3122",
        "C#dim": "0104 ,0 0102",
        "C#aug": "x110 ,0 x110 barre=3-2",
        "C#dim7": "0101 ,0 0102",
        "C#m7b5": "0102 ,0 0102",
        "C#m(maj7)": "1004 ,0 1002",
        D: "2220 ,0 1230",
        Dm: "2210 ,0 2310",
        D7: "2223 ,0 1114",
        Dm7: "2213 ,0 2213",
        DM7: "2224 ,0 1114",
        Dsus4: "0230 ,0 0230",
        D6: "2222 ,0 1111",
        Dm6: "2212 ,0 2213",
        D7sus4: "2233 ,0 1122",
        Dsus2: "x200 ,0 x100",
        Ddim: "4212 fr4 4213",
        Daug: "x221 ,0 x221",
        Ddim7: "1212 fr1 1213 barre=4-2",
        Dm7b5: "1213 fr1 1213 barre=4-2",
        "Dm(maj7)": "2214 ,0 2213",
        "D#": "3331 fr1 3331",
        "D#m": "3321 fr1 3321",
        "D#7": "1112 fr3 1112 barre=4-2",
        "D#m7": "2213 fr2 2213",
        "D#M7": "1113 fr3 1113 barre=4-2",
        "D#sus4": "1341 fr1 1341",
        "D#6": "3333 ,0 1111",
        "D#m6": "3323 ,0 2213",
        "D#7sus4": "3344 ,0 1122",
        "D#sus2": "x311 fr1 x211 barre=2-1",
        "D#dim": "x320 ,0 x210",
        "D#aug": "0332 ,0 0221",
        "D#dim7": "2323 ,0 1213",
        "D#m7b5": "2324 ,0 1213",
        "D#m(maj7)": "2214 fr2 2213",
        E: "4442 ,0 2341",
        Em: "0432 ,0 0321",
        E7: "1202 ,0 1203",
        Em7: "0202 ,0 0203",
        EM7: "1302 ,0 1304",
        Esus4: "4400 ,0 3400",
        E6: "1102 ,0 1102 barre=4-3",
        Em6: "0102 ,0 0102",
        E7sus4: "4200 ,0 2100",
        Esus2: "x422 ,0 x211",
        Edim: "x431 ,0 x321",
        Eaug: "1003 ,0 1002",
        Edim7: "0101 ,0 0102",
        Em7b5: "0201 ,0 0201",
        "Em(maj7)": "0302 ,0 0201",
        F: "2010 ,0 2010",
        Fm: "1013 ,0 1013",
        F7: "2310 ,0 2310",
        Fm7: "1313 ,0 1314",
        FM7: "2413 ,0 2413",
        Fsus4: "3011 ,0 3011",
        F6: "2213 ,0 2213",
        Fm6: "1213 fr1 1213 barre=4-2",
        F7sus4: "3313 ,0 2213",
        Fsus2: "0013 ,0 0012",
        Fdim: "x431 fr2 x321",
        Faug: "2110 ,0 2110 barre=3-2",
        Fdim7: "1212 fr1 1213 barre=4-2",
        Fm7b5: "1312 fr1 1312 barre=4-2",
        "Fm(maj7)": "1413 fr1 1312 barre=4-2",
        "F#": "3121 fr1 3121",
        "F#m": "2120 ,0 2120",
        "F#7": "2313 fr2 2313",
        "F#m7": "1313 fr2 1313",
        "F#M7": "2413 fr2 2413",
        "F#sus4": "4122 fr1 4122",
        "F#6": "3324 ,0 2213",
        "F#m6": "2324 ,0 1213",
        "F#7sus4": "4424 ,0 2213",
        "F#sus2": "1124 fr1 1123 barre=4-3",
        "F#dim": "2020 ,0 1020",
        "F#aug": "3221 ,0 3221",
        "F#dim7": "2323 ,0 1213",
        "F#m7b5": "2423 ,0 1312",
        "F#m(maj7)": "1413 fr2 1312 barre=4-2",
        G: "0232 ,0 0232",
        Gm: "0231 ,0 0231",
        G7: "0212 ,0 0213",
        Gm7: "0211 ,0 0211",
        GM7: "0222 ,0 0111",
        Gsus4: "0233 ,0 0234",
        G6: "0202 ,0 0102",
        Gm6: "0201 ,0 0201",
        G7sus4: "0213 ,0 0213",
        Gsus2: "0230 ,0 0120",
        Gdim: "0131 ,0 0121 barre=3-1",
        Gaug: "0332 ,0 0221",
        Gdim7: "0101 ,0 0102",
        Gm7b5: "0111 ,0 0111 barre=3-1",
        "Gm(maj7)": "0221 ,0 0221",
        "G#": "1343 fr1 1343",
        "G#m": "3231 fr2 3231",
        "G#7": "1323 fr1 1323",
        "G#m7": "1322 fr1 1322",
        "G#M7": "1333 fr1 1333",
        "G#sus4": "1344 fr1 1344",
        "G#6": "1313 fr1 1213 barre=4-2",
        "G#m6": "1312 fr1 1312 barre=4-2",
        "G#7sus4": "1324 ,0 1324",
        "G#sus2": "1341 fr1 1231 barre=4-1",
        "G#dim": "1242 ,0 1243",
        "G#aug": "1003 ,0 1002",
        "G#dim7": "1212 fr1 1213 barre=4-2",
        "G#m7b5": "1222 ,0 1222",
        "G#m(maj7)": "1332 ,0 1332",
        A: "2100 ,0 2100",
        Am: "2000 ,0 2000",
        A7: "0100 ,0 0100",
        Am7: "0000 ,0 0000",
        AM7: "2104 ,0 2104",
        Asus4: "2200 ,0 2300",
        A6: "2424 ,0 1213",
        Am6: "2423 ,0 1312",
        A7sus4: "1324 fr2 1324",
        Asus2: "2402 ,0 1302",
        Adim: "1242 fr2 1243",
        Aaug: "2110 ,0 2110 barre=3-2",
        Adim7: "2323 ,0 1213",
        Am7b5: "2333 ,0 1222",
        "Am(maj7)": "2443 ,0 1332",
        "A#": "3211 fr1 3211 barre=2-1",
        "A#m": "3111 fr1 3111 barre=3-1",
        "A#7": "1211 fr1 1211",
        "A#m7": "1111 fr1 1111 barre=4-1",
        "A#M7": "2211 fr1 2211 barre=2-1",
        "A#sus4": "3311 fr1 3311 barre=2-1",
        "A#6": "1313 fr3 1213 barre=4-2",
        "A#m6": "0111 ,0 0111 barre=3-1",
        "A#7sus4": "1324 fr3 1324",
        "A#sus2": "3011 ,0 2011 barre=2-1",
        "A#dim": "3101 ,0 3102",
        "A#aug": "3221 ,0 3221",
        "A#dim7": "3434 ,0 1213",
        "A#m7b5": "3444 ,0 1222",
        "A#m(maj7)": "3110 ,0 2110 barre=3-2",
        B: "4322 ,0 3211",
        Bm: "4222 ,0 3111",
        B7: "2322 ,0 1211",
        Bm7: "2222 ,0 1111",
        BM7: "3322 ,0 2211",
        Bsus4: "4422 ,0 3411",
        B6: "1313 fr4 1213 barre=4-2",
        Bm6: "1312 fr4 1312 barre=4-2",
        B7sus4: "2422 ,0 1311",
        Bsus2: "4122 ,0 3122",
        Bdim: "4212 ,0 4213",
        Baug: "4332 ,0 3221",
        Bdim7: "1212 fr4 1213 barre=4-2",
        Bm7b5: "4210 ,0 3210",
        "Bm(maj7)": "4221 ,0 3221"
    },
    cd6: {
        C: "x32010 ,0 x32010",
        Cm: "x03320 fr3 x03420 barre=5-1",
        C7: "x32310 ,0 x32410",
        Cm7: "003020 fr3 x03020 barre=5-1",
        CM7: "032000 ,0 x21000",
        Csus4: "x03340 fr3 x02340 barre=5-1",
        C6: "302010 ,0 302010",
        Cm6: "301013 ,0 301024",
        C7sus4: "313011 ,0 314022",
        Csus2: "x30033 ,0 x10022",
        Cdim: "x30x02 fr1 x30x02 barre=4-2",
        Caug: "x32110 ,0 x32000 barre=3-2",
        Cdim7: "x30202 fr1 x40203 barre=4-2",
        Cm7b5: "x30302 fr1 x30402 barre=4-2",
        "Cm(maj7)": "x31003 ,0 x21003",
        "C#": "x13331 fr4 x12341 barre=5-1",
        "C#m": "x13321 fr4 x13421 barre=5-1",
        "C#7": "x13131 fr4 x12131 barre=5-1",
        "C#m7": "x13021 fr4 x14021 barre=5-1",
        "C#M7": "x13231 fr4 x13241 barre=5-1",
        "C#sus4": "x13341 fr4 x12341 barre=5-1",
        "C#6": "403020 fr1 403020 barre=5-1",
        "C#m6": "442320 ,0 331210",
        "C#7sus4": "x44404 ,0 x11102",
        "C#sus2": "x40044 fr1 x20033 barre=4-3",
        "C#dim": "x42020 ,0 x31020",
        "C#aug": "x43221 ,0 x43221",
        "C#dim7": "012020 ,0 012030",
        "C#m7b5": "x42000 ,0 x21000",
        "C#m(maj7)": "x42110 ,0 x32000 barre=3-2",
        D: "000232 ,0 x00132",
        Dm: "000231 ,0 x00231",
        D7: "000212 ,0 x00312",
        Dm7: "000211 ,0 xx0211",
        DM7: "000222 ,0 xx0111",
        Dsus4: "000233 ,0 xx0134",
        D6: "xx0202 ,0 xx0102",
        Dm6: "xx0201 ,0 xx0201",
        D7sus4: "300013 ,0 200013",
        Dsus2: "000230 ,0 000120",
        Ddim: "xx0131 ,0 xx0020 barre=3-1",
        Daug: "xx0332 ,0 xx0221",
        Ddim7: "xx0101 ,0 xx0102",
        Dm7b5: "xx0111 ,0 xx0000 barre=3-1",
        "Dm(maj7)": "xx0221 ,0 xx0221",
        "D#": "x03330 fr6 002340 barre=5-1",
        "D#m": "x03320 fr6 003410 barre=5-1",
        "D#7": "x03030 fr6 x02030 barre=5-1",
        "D#m7": "x03020 fr6 x03020 barre=5-1",
        "D#M7": "003230 fr6 x03240 barre=5-1",
        "D#sus4": "x03340 fr6 x02340 barre=5-1",
        "D#6": "311013 ,0 311024",
        "D#m6": "xx0302 fr1 xx0302 barre=4-2",
        "D#7sus4": "400024 fr1 300024 barre=5-3",
        "D#sus2": "000340 fr1 000230 barre=6-1",
        "D#dim": "xx1242 ,0 xx1243",
        "D#aug": "xx1003 ,0 xx1002",
        "D#dim7": "201212 ,0 200304 barre=4-2",
        "D#m7b5": "201222 ,0 201333",
        "D#m(maj7)": "x10342 ,0 x10342",
        E: "022100 ,0 023100",
        Em: "022000 ,0 023000",
        E7: "020100 ,0 020100",
        Em7: "022030 ,0 023040",
        EM7: "021100 ,0 031200",
        Esus4: "022200 ,0 023400",
        E6: "022120 ,0 022130",
        Em6: "022020 ,0 011020",
        E7sus4: "000200 ,0 000100",
        Esus2: "024400 ,0 012200",
        Edim: "0120x0 ,0 0120x0",
        Eaug: "032110 ,0 032000 barre=3-2",
        Edim7: "012020 ,0 012030",
        Em7b5: "010030 ,0 010020",
        "Em(maj7)": "021000 ,0 021000",
        F: "033200 fr1 034200 barre=6-1",
        Fm: "033000 fr1 034000 barre=6-1",
        F7: "030200 fr1 030200 barre=6-1",
        Fm7: "030000 fr1 030000 barre=6-1",
        FM7: "xx3210 ,0 xx3210",
        Fsus4: "033300 fr1 023400 barre=6-1",
        F6: "100211 ,0 100322",
        Fm6: "130111 ,0 130222",
        F7sus4: "000300 fr1 000200 barre=6-1",
        Fsus2: "133011 ,0 133022",
        Fdim: "123104 ,0 023004 barre=6-3",
        Faug: "103221 ,0 104332",
        Fdim7: "120101 ,0 140203",
        Fm7b5: "121104 ,0 020003 barre=6-3",
        "Fm(maj7)": "133110 ,0 022000 barre=6-2",
        "F#": "033200 fr2 034200 barre=6-1",
        "F#m": "033000 fr2 034000 barre=6-1",
        "F#7": "030200 fr2 030200 barre=6-1",
        "F#m7": "030000 fr2 030000 barre=6-1",
        "F#M7": "0x220x fr2 0x230x barre=6-2",
        "F#sus4": "033300 fr2 023400 barre=6-1",
        "F#6": "200322 fr1 200433 barre=5-4",
        "F#m6": "201222 ,0 201333",
        "F#7sus4": "222420 ,0 111210",
        "F#sus2": "244122 ,0 244133",
        "F#dim": "20421x ,0 20431x",
        "F#aug": "210332 ,0 210443",
        "F#dim7": "201212 ,0 200304 barre=4-2",
        "F#m7b5": "202210 ,0 203310",
        "F#m(maj7)": "203222 ,0 103222",
        G: "320003 ,0 230004",
        Gm: "033000 fr3 034000 barre=6-1",
        G7: "320001 ,0 320001",
        Gm7: "030000 fr3 030000 barre=6-1",
        GM7: "320002 ,0 310002",
        Gsus4: "033300 fr3 023400 barre=6-1",
        G6: "320000 ,0 210000",
        Gm6: "310030 ,0 210030",
        G7sus4: "330011 ,0 220000 barre=2-1",
        Gsus2: "300033 ,0 100022",
        Gdim: "31x023 ,0 31x024",
        Gaug: "321003 ,0 321004",
        Gdim7: "312020 ,0 412030",
        Gm7b5: "303320 fr1 304420 barre=5-1",
        "Gm(maj7)": "310032 ,0 310042",
        "G#": "033200 fr4 034200 barre=6-1",
        "G#m": "033000 fr4 034000 barre=6-1",
        "G#7": "030200 fr4 030200 barre=6-1",
        "G#m7": "030000 fr4 030000 barre=6-1",
        "G#M7": "0x220x fr4 0x230x barre=6-2",
        "G#sus4": "033300 fr4 023400 barre=6-1",
        "G#6": "430000 fr1 320000 barre=4-1",
        "G#m6": "421101 ,0 431102",
        "G#7sus4": "440022 fr1 330022 barre=4-3",
        "G#sus2": "400044 fr1 200033 barre=5-3",
        "G#dim": "420104 ,0 320104",
        "G#aug": "432110 ,0 432000 barre=3-2",
        "G#dim7": "420101 ,0 430102",
        "G#m7b5": "420102 ,0 420103",
        "G#m(maj7)": "421003 ,0 421003",
        A: "002220 ,0 002340",
        Am: "002210 ,0 002310",
        A7: "002020 ,0 002030",
        Am7: "002010 ,0 002010",
        AM7: "002120 ,0 x02130",
        Asus4: "x02230 ,0 x02340",
        A6: "x02222 ,0 x01111",
        Am6: "x02212 ,0 x02213",
        A7sus4: "x00030 ,0 x00010",
        Asus2: "x02200 ,0 x01100",
        Adim: "x0121x ,0 x0020x barre=4-2",
        Aaug: "x03221 ,0 x03221",
        Adim7: "x01212 ,0 x00203 barre=4-2",
        Am7b5: "x01013 ,0 x01023",
        "Am(maj7)": "x02110 ,0 x02000 barre=3-2",
        "A#": "x13331 fr1 x12341 barre=5-1",
        "A#m": "x13321 fr1 x13421 barre=5-1",
        "A#7": "x13131 fr1 x12131 barre=5-1",
        "A#m7": "x13121 fr1 x13121 barre=5-1",
        "A#M7": "x13231 fr1 x13241 barre=5-1",
        "A#sus4": "x13341 fr1 x12341 barre=5-1",
        "A#6": "x10031 ,0 x10032",
        "A#m6": "x13021 ,0 x14032",
        "A#7sus4": "x00040 fr1 x00020 barre=5-1",
        "A#sus2": "x03300 fr1 x02200 barre=5-1",
        "A#dim": "x12320 ,0 x12430",
        "A#aug": "x10332 ,0 x10332",
        "A#dim7": "x12020 ,0 x12030",
        "A#m7b5": "x12120 ,0 x02030 barre=5-3",
        "A#m(maj7)": "103321 ,0 104432",
        B: "x03330 fr2 002340 barre=5-1",
        Bm: "x03320 fr2 003410 barre=5-1",
        B7: "021202 ,0 x21304",
        Bm7: "003020 fr2 x03020 barre=5-1",
        BM7: "003230 fr2 x03240 barre=5-1",
        Bsus4: "x03340 fr2 x02340 barre=5-1",
        B6: "x21102 ,0 x20003 barre=4-3",
        Bm6: "x20102 ,0 x20103",
        B7sus4: "x13141 fr2 x12131",
        Bsus2: "244402 ,0 133302",
        Bdim: "x20401 ,0 x20301",
        Baug: "x21003 ,0 x21003",
        Bdim7: "x20101 ,0 x30102",
        Bm7b5: "x20201 ,0 x20301",
        "Bm(maj7)": "x20302 ,0 x10302"
    },
    // Finger names sit at y=-26; a 6px font needs a few more pixels above that.
    // The anchor itself is 2 above the staff top we measured.
    _above: 40,
    draw_gchord: function (of, i, s, x, y) {
        var gch, cfmt = this.cfmt(), n = cfmt.diag
        function ch_cnv(t) {
            // Browser text measurement can wrap the name in <tspan>. The
            // shape table is keyed by the chord letters only.
            t = String(t == null ? "" : t).replace(/<[^>]*>/g, "")
            var a = t.match(/[A-G][#♯b♭]?([^/]*)\/?/)
            if (a && a[1]) {
                a[2] = abc2svg.ch_alias[a[1]]
                if (a[2] != undefined)
                    t = t.replace(a[1], a[2])
            }
            return t.replace('/', '.').replace(/\u266f/g, '#').replace(/\u266d/g, 'b')
        }
        function canonical_chord(label) {
            // Shapes are stored once, under the sharp spelling.
            var roots = {
                Bb: "A#", Eb: "D#", Ab: "G#", Db: "C#", Gb: "F#",
                Cb: "B", Fb: "E", "E#": "F", "B#": "C"
            }, match = /^([A-G](?:#|b)?)(.*)$/.exec(label)
            if (!match || roots[match[1]] == undefined)
                return label
            return roots[match[1]] + match[2]
        }
        function shape_name(label) {
            var table = abc2svg.diag["cd" + n], spelled, root
            if (!table || !label)
                return ""
            // min+7 is aliased to m+7; the shapes are stored as m(maj7).
            spelled = canonical_chord(label).replace(/m\+7/g, "m(maj7)")
            if (table[spelled])
                return spelled
            root = spelled.split(".")[0]
            if (root && table[root])
                return root
            return ""
        }
        function board() {
            // Inline paint: a later system SVG does not repeat .stroke, and a
            // class-only line disappears when that rule is not in scope.
            if (n == 4)
                return '<path class="stroke" stroke="currentColor" fill="none" stroke-width="0.8" d="M-6 -24h12m0 6h-12m0 6h12m0 6h-12m0 6h12"/>'
                    + '<path class="stroke" stroke="currentColor" fill="none" stroke-width="0.8" d="M-6 -24v24m4 0v-24m4 0v24m4 0v-24"/>'
            return '<path class="stroke" stroke="currentColor" fill="none" stroke-width="0.8" d="M-10 -24h20m0 6h-20m0 6h20m0 6h-20m0 6h20"/>'
                + '<path class="stroke" stroke="currentColor" fill="none" stroke-width="0.8" d="M-10 -24v24m4 0v-24m4 0v24m4 0v-24m4 0v24m4 0v-24"/>'
        }
        function nut() {
            if (n == 4)
                return '<path class="stroke" stroke="currentColor" fill="none" stroke-width="1.6" d="M-6.2 -24.5h12.4"/>'
            return '<path class="stroke" stroke="currentColor" fill="none" stroke-width="1.6" d="M-10.2 -24.5h20.4"/>'
        }
        function diagram(label) {
            var d, l, i, barre, x0, dc = abc2svg.diag["cd" + n][label]
            if (!dc)
                return ""
            d = dc.split(" ")
            if (d.length < 3)
                return ""
            x0 = 2 - 2 * n
            dc = board()
            l = d[1].split(",")
            if (!l[0] || l[0].slice(-1) == l[1])
                dc += nut()
            if (l[0])
                dc += '<text x="' + (x0 - 10)
                    + '" y="' + ((l[1] || 1) * 6 - 25)
                    + '" class="frn">' + l[0] + "</text>"
            dc += '<text x="' + (n == 6 ? "-12,-8,-4,0,4,8" : "-8,-4,0,4")
                + '" y="-26" class="fng">'
                + d[2].replace(/[y0]/g, "\u00a0")
                + "</text>"
            for (i = 0; i < n; i++) {
                l = d[0][i]
                if (l && l != "x" && l != "0")
                    dc += '<circle class="fill" fill="currentColor" cx="' + (i * 4 + x0)
                        + '" cy="' + (l * 6 - 27)
                        + '" r="1.5"/>'
            }
            if (d[3]) {
                barre = d[3].match(/barre=(\d)-(\d)/)
                if (barre)
                    dc += '<path class="stroke" stroke="currentColor" fill="none" stroke-width="1.4" d="M'
                        + ((n - barre[1]) * 4 + x0 - 2)
                        + " -21h" + ((barre[1] - barre[2]) * 4 + 4) + '"/>'
            }
            return dc
        }
        of(i, s, x, y)
        if ((s.invis && s.play) || !n)
            return
        gch = s.a_gch[i]
        if (!gch || gch.type != "g" || gch.capo)
            return
        try {
            var label = shape_name(ch_cnv(gch.text)), inner, staffs, anchor
            inner = label && diagram(label)
            if (!inner || !this.sx || !this.sy || !this.out_svg)
                return
            staffs = this.get_staff_tb && this.get_staff_tb()
            x = s.x
            if (this.y_get && staffs && staffs[s.st] != null)
                anchor = this.y_get(s.st, 1, x - 14, 28) + 2
            else {
                // Cores that keep y_get private still pass the chord baseline.
                var chordH = (gch.text && gch.text.wh && gch.text.wh[1]) || 14
                anchor = y + chordH + 4
            }
            this.add_style("\n.fng {font:6px sans-serif;fill:currentColor}\n.frn {font:italic 7px sans-serif;fill:currentColor}")
            this.out_svg('<g class="diag" transform="translate('
                + this.sx(x).toFixed(1) + "," + this.sy(anchor).toFixed(1)
                + ')">' + inner + "</g>\n")
            if (this.y_set && staffs && staffs[s.st] != null)
                this.y_set(s.st, 1, x - 14, 28, anchor + abc2svg.diag._above)
        } catch (err) {
            /* Keep the chord name even if one diagram cannot be drawn. */
        }
    },
    set_fmt: function (of, cmd, param) {
        var a, d, n, cfmt = this.cfmt()
        switch (cmd) {
            case "diagram":
                n = param
                if (n == '0')
                    n = ''
                else if (n != '4')
                    n = '6'
                cfmt.diag = n
                return
            case "setdiag":
                n = cfmt.diag
                if (!n)
                    n = "6"
                a = param.match(/(\S*)\s+(.*)/)
                if (a && a.length == 3) {
                    d = a[2].split(' ')
                    if (d && d.length >= 3) {
                        abc2svg.diag["cd" + n][a[1].replace('/', '.')] = a[2]
                        return
                    }
                }
                this.syntax(1, this.errs.bad_val, "%%setdiag")
                return
        }
        of(cmd, param)
    },
    set_hooks: function (abc) {
        if (abc.draw_gchord && !abc.draw_gchord._yueDiag) {
            var draw = abc2svg.diag.draw_gchord.bind(abc, abc.draw_gchord)
            draw._yueDiag = true
            abc.draw_gchord = draw
        }
        if (abc.set_format && !abc.set_format._yueDiag) {
            var fmt = abc2svg.diag.set_fmt.bind(abc, abc.set_format)
            fmt._yueDiag = true
            abc.set_format = fmt
        }
    }
}
abc2svg.modules.hooks.push(abc2svg.diag.set_hooks)
}
if (abc2svg.modules && abc2svg.modules.diagram)
    abc2svg.modules.diagram.loaded = true
