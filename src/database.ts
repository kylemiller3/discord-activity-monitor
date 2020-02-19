import pgp, { PreparedStatement } from 'pg-promise';
// eslint-disable-next-line import/no-unresolved
import pg from 'pg-promise/typescript/pg-subset';
import { Utils } from './utils';
import { dbPassword, dbHost, dbPort, dbName, dbUser } from '../auth';
import { async } from 'rxjs/internal/scheduler/async';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Db {
    const initOptions: pgp.IInitOptions = {
        capSQL: true,
        connect(client: pg.IClient): void {
            const cp = client.connectionParameters;
            Utils.logger.trace('Connected to database:', cp.database);
        },
        disconnect(client: pg.IClient): void {
            const cp = client.connectionParameters;
            Utils.logger.trace('Disconnecting from database:', cp.database);
        },
        query(event: pgp.IEventContext): void {
            Utils.logger.trace(`${event.query.name}\n${event.query.text}`);
        },
        receive(data: unknown): void {
            Utils.logger.trace(JSON.stringify(data));
        },
        task(event: pgp.IEventContext): void {
            if (event.ctx.finish) {
                // this is a task->finish event;
                Utils.logger.debug('Duration:', event.ctx.duration);
                if (event.ctx.success) {
                    // e.ctx.result = resolved data;
                    Utils.logger.debug('Task successful');
                } else {
                    // e.ctx.result = error/rejection reason;
                    Utils.logger.debug('Task failed: ', event.ctx.result);
                }
            } else {
                // this is a task->start event;
                Utils.logger.debug('Start Time:', event.ctx.start);
            }
        },
        transact(event: pgp.IEventContext): void {
            if (event.ctx.finish) {
                // this is a transaction->finish event;
                Utils.logger.debug('Duration:', event.ctx.duration);
                if (event.ctx.success) {
                    // e.ctx.result = resolved data;
                } else {
                    // e.ctx.result = error/rejection reason;
                }
            } else {
                // this is a transaction->start event;
                Utils.logger.debug('Start Time:', event.ctx.start);
            }
        },
        error(err: Error, event: pgp.IEventContext): void {
            if (event.cn) {
                // this is a connection-related error
                // cn = safe connection details passed into the library:
                //      if password is present, it is masked by #
            }
            if (event.query) {
                // query string is available
                Utils.logger.error('Query: ', event.query);
                if (event.params) {
                    // query parameters are available
                    Utils.logger.error('Params: ', event.params);
                }
            }
            if (event.ctx) {
                // occurred inside a task or transaction
            }
        },
    };

    export const mainDb = pgp(initOptions)({
        host: dbHost,
        port: dbPort,
        database: dbName,
        user: dbUser,
        password: dbPassword,
    });

    // export const testDb = pgp(initOptions)({
    //     host: dbHost,
    //     port: dbPort,
    //     database: dbName,
    //     user: dbUser,
    //     password: dbPassword,
    // });

    export const createTables = (
        db: pgp.IDatabase<unknown, pg.IClient> = Db.mainDb,
    ): Promise<unknown> => db.tx(
        async (task: pgp.ITask<unknown>):
            Promise<void> => {
            task.none({
                text: 'CREATE TABLE IF NOT EXISTS '
                    + 'msgs '
                    + '('
                    + 'id SERIAL PRIMARY KEY, '
                    + 'ts TIMESTAMP NOT NULL, '
                    + 'user_id VARCHAR(50) NOT NULL, '
                    + 'guild_id VARCHAR(50) NOT NULL, '
                    + 'channel_id VARCHAR(50) NOT NULL, '
                    + 'msg_id VARCHAR(50) NOT NULL, '
                    + 'msg_len INTEGER NOT NULL'
                    + ')',
            });
            task.none({
                text: 'CREATE INDEX IF NOT EXISTS idx_ts ON '
                    + 'msgs '
                    + '('
                    + 'ts'
                    + ')',
            });
            task.none({
                text: 'CREATE INDEX IF NOT EXISTS idx_userId ON '
                    + 'msgs '
                    + '('
                    + 'user_id'
                    + ')',
            });
            task.none({
                text: 'CREATE INDEX IF NOT EXISTS idx_msgId ON '
                    + 'msgs '
                    + '('
                    + 'msg_id'
                    + ')',
            });

            task.none({
                text: 'CREATE TABLE IF NOT EXISTS '
                    + 'vc '
                    + '('
                    + 'id SERIAL PRIMARY KEY, '
                    + 'ts_in TIMESTAMP NOT NULL, '
                    + 'ts_out TIMESTAMP NOT NULL, '
                    + 'user_id VARCHAR(50) NOT NULL, '
                    + 'guild_id VARCHAR(50) NOT NULL'
                    + ')',
            });

            task.none({
                text: 'CREATE INDEX IF NOT EXISTS idx_ts ON '
                    + 'vc '
                    + '('
                    + 'ts_in'
                    + ')',
            });
            task.none({
                text: 'CREATE INDEX IF NOT EXISTS idx_user_id ON '
                    + 'vc '
                    + '('
                    + 'ts_out'
                    + ')',
            });
            task.none({
                text: 'CREATE INDEX IF NOT EXISTS idx_msg_id ON '
                    + 'vc '
                    + '('
                    + 'user_id'
                    + ')',
            });
            task.none({
                text: 'CREATE TABLE IF NOT EXISTS '
                    + 'settings '
                    + '('
                    + 'guild_id VARCHAR(50) PRIMARY KEY NOT NULL, '
                    + 'afk_channel_id VARCHAR(50) NOT NULL'
                    + ')',
            });
        },
    );

    const insertNewMsgStmt: pgp.PreparedStatement = new pgp.PreparedStatement({
        name: 'insert new message',
        text: 'INSERT INTO msgs '
            + '(ts, user_id, guild_id, channel_id, msg_id, msg_len) '
            + 'VALUES '
            + '($1, $2, $3, $4, $5, $6)',
    });
    export const insertNewMsg = async (
        ts: Date,
        userId: string,
        guildId: string,
        channelId: string,
        msgId: string,
        msgLen: number,
        db: pgp.IDatabase<unknown> = Db.mainDb,
    ): Promise<void> => {
        await db.none(
            insertNewMsgStmt,
            [
                ts.toISOString(),
                userId,
                guildId,
                channelId,
                msgId,
                msgLen,
            ],
        );
    };

    const deleteMsgStmt: pgp.PreparedStatement = new pgp.PreparedStatement({
        name: 'delete message',
        text: 'DELETE FROM msgs '
        + 'WHERE msg_id = $1'
    });
    export const deleteMsg = async (
        msgId: string,
        db: pgp.IDatabase<unknown> = Db.mainDb,
    ): Promise<void> => {
        await db.none(
            deleteMsgStmt,
            [
                msgId,
            ],
        );
    };

    const insertNewVcStmt: pgp.PreparedStatement = new pgp.PreparedStatement({
        name: 'insert new vc',
        text: 'INSERT INTO vc '
            + '(ts_in, ts_out, user_id, guild_id) '
            + 'VALUES '
            + '($1, $2, $3, $4)',
    });
    export const insertNewVc = async (
        tsIn: Date,
        tsOut: Date,
        userId: string,
        guildId: string,
        db: pgp.IDatabase<unknown> = Db.mainDb,
    ): Promise<void> => {
        await db.none(
            insertNewVcStmt,
            [
                tsIn.toISOString(),
                tsOut.toISOString(),
                userId,
                guildId,
            ],
        );
    };

    const fetchTopUsersByMessageCountStmt: pgp.PreparedStatement = new pgp.PreparedStatement({
        name: 'fetch top users by msg count',
        text: 'SELECT COUNT(msgs.id) as msg_count, avg(msgs.msg_len) as avg_length, msgs.user_id '
            + 'FROM msgs '
            + 'WHERE msgs.guild_id = $1 '
            + 'GROUP BY msgs.user_id '
            + 'ORDER BY msg_count DESC',
    });
    export const fetchTopUsersByMessageCount = async (
        guildId: string,
        db: pgp.IDatabase<unknown> = Db.mainDb,
    ): Promise<{
        msgCount: number;
        avgLength: number;
        userId: string;
    }[]> => {
        const arr: {
            msg_count: number;
            avg_length: number;
            user_id: string;
        }[] = await db.manyOrNone(
            fetchTopUsersByMessageCountStmt,
            [
                guildId,
            ],
        );

        return arr.map(
            (obj: {
                msg_count: number;
                avg_length: number;
                user_id: string;
            }): {
                msgCount: number;
                avgLength: number;
                userId: string;
            } => ({
                msgCount: Number(obj.msg_count),
                avgLength: Number(obj.avg_length),
                userId: obj.user_id,
            }),
        );
    };

    const fetchTopUsersByVoiceChatTimeStmt: pgp.PreparedStatement = new pgp.PreparedStatement({
        name: 'fetch top users by vc count',
        text: 'SELECT COUNT(vc.id) as vc_count, EXTRACT(EPOCH from avg(vc.ts_out - vc.ts_in)) as avg_duration, EXTRACT(EPOCH from sum(vc.ts_out - vc.ts_in)) as total_duration, vc.user_id '
            + 'FROM vc '
            + 'WHERE vc.guild_id = $1 '
            + 'GROUP BY vc.user_id '
            + 'ORDER BY total_duration DESC',
    });
    export const fetchTopUsersByVoiceChatCount = async (
        guildId: string,
        db: pgp.IDatabase<unknown> = Db.mainDb,
    ): Promise<{
        vcCount: number;
        avgDuration: number;
        totalDuration: number;
        userId: string;
    }[]> => {
        const arr: {
            vc_count: number;
            avg_duration: number;
            total_duration: number;
        }[] = await db.manyOrNone(
            fetchTopUsersByVoiceChatTimeStmt,
            [
                guildId,
            ],
        );

        return arr.map(
            (obj: {
                vc_count: number;
                avg_duration: number;
                total_duration: number;
                user_id: string;
            }): {
                vcCount: number;
                avgDuration: number;
                totalDuration: number
                userId: string;
            } => ({
                vcCount: obj.vc_count,
                avgDuration: obj.avg_duration,
                totalDuration: obj.total_duration,
                userId: obj.user_id,
            })
        );
    }

    const sampleUserMessagesStmt: pgp.PreparedStatement = new pgp.PreparedStatement({
        name: 'sample user messages',
        text: 'SELECT channel_id, msg_id FROM '
            + '(SELECT DISTINCT msg_id, channel_id, guild_id, user_id FROM msgs) AS foo '
            + 'WHERE user_id = $1 AND guild_id = $2 '
            + 'ORDER BY random() '
            + 'LIMIT 50',
    });
    export const sampleUserMessages = async (
        userId: string,
        guildId: string,
        db: pgp.IDatabase<unknown> = Db.mainDb,
    ): Promise<{
        channelId: string;
        msgId: string;
    }[]> => {
        const sampled: {
            channel_id: string;
            msg_id: string;
        }[] = await db.manyOrNone(
            sampleUserMessagesStmt,
            [
                userId,
                guildId,
            ],
        );
        return sampled.map(
            (sample: {
                channel_id: string;
                msg_id: string;
            }): {
                channelId: string;
                msgId: string;
            } => ({
                channelId: sample.channel_id,
                msgId: sample.msg_id,
            }),
        );
    };

    // text: 'CREATE TABLE IF NOT EXISTS '
    // + 'settings '
    // + '('
    // + 'id SERIAL PRIMARY KEY, '
    // + 'guild_id VARCHAR(50) NOT NULL, '
    // + 'afk_channel_id VARCHAR(50) NOT NULL'
    // + ')',
    const upsertSettingsStmt: pgp.PreparedStatement = new pgp.PreparedStatement({
        name: 'insert new settings',
        text: 'INSERT INTO settings (guild_id, afk_channel_id) '
            + 'VALUES ($1, $2) '
            + 'ON CONFLICT '
            + 'SET afk_channel_id = $2 '
            + 'RETURNING *',
    });
    export const upsertSettings = async (
        guildId: string,
        afkChannelId: string,
        db: pgp.IDatabase<unknown> = Db.mainDb,
    ): Promise<null> => {
        return await db.none(
            upsertSettingsStmt,
            [
                guildId,
                afkChannelId,
            ],
        );
    };

    const fetchSettingsStmt: pgp.PreparedStatement = new pgp.PreparedStatement({
        name: 'fetch settings',
        text: 'SELECT * FROM settings '
        + 'WHERE guildId = $1'
    })
    export const fetchSettings = async (
        guildId: string,
        db: pgp.IDatabase<unknown> = Db.mainDb,
    ): Promise<{
        guildId: string,
        afkChannelId: string,
    } | null> => {
        const ret: {
            guild_id: string;
            afk_channel_id: string;
        } | null = await db.oneOrNone(
            upsertSettingsStmt,
            [
                guildId,
            ],
        );
        return ret !== null
            ? {
                guildId: ret['guild_id'],
                afkChannelId: ret['afk_channel_id'],
            }
            : null;
    };
}
