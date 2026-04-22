const { pool } = require('../config/db');

async function fixUsernames() {
    const client = await pool.connect();
    try {
        const { rows: users } = await client.query(
            "SELECT id, username, full_name FROM users WHERE full_name IS NOT NULL AND full_name != ''"
        );

        let updated = 0;
        for (const user of users) {
            const newUsername = user.full_name
                .replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '')
                .replace(/\s+/g, '');

            if (!newUsername || newUsername === user.username) continue;

            const existing = await client.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [newUsername, user.id]
            );

            const finalUsername = existing.rows.length > 0
                ? newUsername + Math.floor(100 + Math.random() * 900)
                : newUsername;

            await client.query('UPDATE users SET username = $1 WHERE id = $2', [finalUsername, user.id]);
            console.log(`  ${user.username} → ${finalUsername} (${user.full_name})`);
            updated++;
        }

        console.log(`\nTotal: ${users.length} usuarios, ${updated} actualizados.`);
    } finally {
        client.release();
        await pool.end();
    }
}

fixUsernames().catch(err => { console.error(err); process.exit(1); });
