export default async function handler(req, res) {
    // ==========================================
    // BULLET PH - API CAPTCHA SOLVER (CAPMONSTER)
    // AUTO-DETECT SINGLE & MASSAL (MAX TIMEOUT)
    // ==========================================
    const API_KEY = "50631b384d9931bb2b33f51a38af66ef";
    const WEB_KEY = "fef5c67c39074e9d845f4bf579cc07af";
    const WEB_URL = "https://checkton.online";

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const solveSingleCaptcha = async () => {
        try {
            // 1. Create Task
            const createReq = await fetch("https://api.capmonster.cloud/createTask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientKey: API_KEY,
                    task: {
                        type: "YidunTask",
                        websiteURL: WEB_URL,
                        websiteKey: WEB_KEY
                    }
                })
            });
            const create = await createReq.json();

            if (!create.taskId) {
                return { status: "error", message: "Gagal membuat tugas", code: create.errorCode || "UNKNOWN" };
            }

            const taskId = create.taskId;
            let token = "";

            // 2. Polling (Menunggu Jawaban AI)
            // Loop dinaikkan jadi 19 kali (19 x 3 detik = 57 detik)
            // Disisakan 3 detik agar tidak di-kill otomatis oleh Vercel
            for (let i = 0; i < 19; i++) {
                await sleep(3000);
                const resultReq = await fetch("https://api.capmonster.cloud/getTaskResult", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clientKey: API_KEY, taskId: taskId })
                });
                const result = await resultReq.json();

                if (result.status === 'ready') {
                    token = result.solution?.token || "";
                    break;
                }
                if (result.errorId !== 0) {
                    return { status: "error", message: "AI CapMonster error", code: result.errorCode };
                }
            }

            // 3. Response Akhir
            if (token) {
                return { status: "success", cn31: token, taskId: taskId };
            } else {
                return { status: "error", message: "Waktu habis (AI Timeout > 57 detik)" };
            }
        } catch (error) {
            return { status: "error", message: "Error server", detail: error.message };
        }
    };

    // --- LOGIC AUTO-DETECT SINGLE / MASSAL ---
    
    let count = 1;
    let isMassal = false;

    // Cek JSON Body
    if (req.method === 'POST' && req.body) {
        if (Array.isArray(req.body)) {
            count = req.body.length;
            isMassal = true;
        } else if (req.body.count) {
            count = parseInt(req.body.count, 10);
            isMassal = true;
        }
    }
    
    // Cek Query URL
    if (req.query && req.query.count) {
        count = parseInt(req.query.count, 10);
        isMassal = true;
    }

    if (count <= 1 || isNaN(count)) {
        count = 1;
        isMassal = false;
    }

    // Limit proses untuk mengamankan server
    if (count > 20) count = 20;

    // --- EKSEKUSI OTOMATIS ---

    if (isMassal) {
        const tasks = [];
        for (let i = 0; i < count; i++) {
            tasks.push(solveSingleCaptcha());
        }
        const results = await Promise.all(tasks);
        return res.status(200).json(results); 
    } else {
        const result = await solveSingleCaptcha();
        return res.status(200).json(result);
    }
}
