import * as discord from 'discord.js';
import { EventEmitter } from 'events';
import {
    fromEvent, Observable, GroupedObservable, merge, partition, from, concat, defer, of
} from 'rxjs';
import {
    tap, groupBy, mergeMap, throttleTime, filter, pairwise, skipWhile, skipUntil, map, catchError,
} from 'rxjs/operators';
import { Db } from './src/database';
import { Utils } from './src/utils';
import { discordKey } from './auth';
import { parse } from 'json2csv';
import { writeFileSync, unlinkSync } from 'fs';

const gClient: discord.Client = new discord.Client();

export const getTagFromDiscordId = async (
    client: discord.Client,
    discordId: string,
): Promise<string | null> => {
    const user: discord.User | null = await client.fetchUser(
        discordId,
    ).catch(
        (): null => null,
    );
    return user
        ? user.tag
        : null;
};

export const getDisplayNameFromDiscordId = (
    client: discord.Client,
    guildId: string,
    discordId: string,
): string | null => {
    const guild: discord.Guild = client.guilds.get(
        guildId,
    ) as discord.Guild;
    if (guild === undefined || !guild.available) return null;
    const foundMember: discord.GuildMember = guild.members.find(
        (member: discord.GuildMember):
            boolean => member.id === discordId,
    );
    if (foundMember === null) return null;
    return foundMember.displayName;
};

const regex = /[\s\S]{1,1950}(?:\n|$)/g;
export const getMessageChunks = (
    content: string,
): string[] => content.match(regex) || [];

export const postReplyByChunks = (
    msg: discord.Message,
    content: string,
    characterLimit: number = 10000,
): void => {
    const limitedContent: string = content.substring(0, characterLimit);
    let removedContent: string = limitedContent.replace(/`+|<@!?[0-9]+>,?|<#[0-9]+>,?/g, '');
    removedContent = removedContent.replace(/[ \t]+$/gm, '');
    // removedContent = removedContent.replace(/^\s*[\r\n]/gm, '');
    const requestObservables: Observable<discord.Message | discord.Message[]>[] = getMessageChunks(
        removedContent,
    ).map(
        // (substr: string): Observable<discord.Message | discord.Message[]> => defer(
        //     (): Promise<discord.Message | discord.Message[]> => command.reply(substr, { code: true }),
        // ),
        (substr: string): Observable<discord.Message | discord.Message[]> => from(
            msg.reply(`${substr.substring(0, 1950)}`, { code: true }),
        ),
    );
    concat(requestObservables).pipe(
        catchError(
            (error: Error): Observable<null> => {
                Utils.logger.error(error);
                return of(null);
            },
        ),
    );
};

const messageReceived$: Observable<discord.Message> = fromEvent(
    gClient as unknown as EventEmitter,
    'message',
).pipe(
    filter(
        (msg: discord.Message): boolean => !msg.author.bot && msg.content.length > 0
    ),
);

const vcChanged$: Observable<[discord.GuildMember, discord.GuildMember]> = fromEvent(
    gClient as unknown as EventEmitter,
    'voiceStateUpdate',
).pipe(
    filter(
        (oldNewMember: [discord.GuildMember, discord.GuildMember]): boolean => !oldNewMember[0].user.bot
    )
);;

const [command$, message$] = partition(
    messageReceived$,
    (msg: discord.Message): boolean => msg.content.startsWith('--'),
);

command$.subscribe(
    async (command: discord.Message): Promise<void> => {
        if (command.content.toLowerCase().startsWith('--activity'.toLowerCase())) {
            const topUsersMsgs: {
                msgCount: number;
                avgLength: number;
                userId: string;
            }[] = await Db.fetchTopUsersByMessageCount(command.guild.id);

            const topUsersMsgsWithTagsPromises: Promise<{
                user_name: string | null,
                user_tag: string | null,
                count: number,
                avg_length: number,
                user_id: string,
            }>[] = topUsersMsgs.map(
                async (topUserMsg: {
                    msgCount: number;
                    avgLength: number;
                    userId: string;
                }): Promise<{
                    user_name: string | null,
                    user_tag: string | null,
                    count: number,
                    avg_length: number,
                    user_id: string,
                }> => {
                    const userTag: string | null = await getTagFromDiscordId(
                        gClient,
                        topUserMsg.userId,
                    );
                    const userName: string | null = getDisplayNameFromDiscordId(
                        gClient,
                        command.guild.id,
                        topUserMsg.userId,
                    );
                    return {
                        user_name: userName,
                        user_tag: userTag,
                        count: topUserMsg.msgCount,
                        avg_length: Number(topUserMsg.avgLength.toFixed(0)),
                        user_id: topUserMsg.userId,
                    }
                }
            );

            const topUsersMsgsWithTags:{
                user_name: string | null,
                user_tag: string | null,
                count: number,
                avg_length: number,
                user_id: string,
            }[] = await Promise.all(topUsersMsgsWithTagsPromises);

            const topUsersVC: {
                vcCount: number;
                avgDuration: number;
                totalDuration: number
                userId: string;
            }[] = await Db.fetchTopUsersByVoiceChatCount(command.guild.id);

            const topUsersVCWithTagsPromises: Promise<{
                user_name: string | null,
                user_tag: string | null,
                count: number,
                avg_duration: string,
                total_duration: string,
                user_id: string,
            }>[] = topUsersVC.map(
                async (topUserVC: {
                    vcCount: number;
                    avgDuration: number;
                    totalDuration: number;
                    userId: string;
                }): Promise<{
                    user_name: string | null,
                    user_tag: string | null,
                    count: number,
                    avg_duration: string,
                    total_duration: string,
                    user_id: string,
                }> => {
                    const padToTwo = number => number <= 99 ? `0${number}`.slice(-2) : number;
                    const avgHours: number = Math.floor(topUserVC.avgDuration / (60 * 60));
                    const avgMins: number = Math.floor((topUserVC.avgDuration / 60) - avgHours * 60);
                    const totalHours: number = Math.floor(topUserVC.totalDuration / (60 * 60));
                    const totalMins: number = Math.floor((topUserVC.totalDuration / 60) - totalHours * 60);
                    const userTag: string | null = await getTagFromDiscordId(
                        gClient,
                        topUserVC.userId,
                    );
                    const userName: string | null = getDisplayNameFromDiscordId(
                        gClient,
                        command.guild.id,
                        topUserVC.userId,
                    )
                    return {
                        user_name: userName,
                        user_tag: userTag,
                        count: topUserVC.vcCount,
                        avg_duration: `${padToTwo(avgHours)}:${padToTwo(avgMins)}`,
                        total_duration: `${padToTwo(totalHours)}:${padToTwo(totalMins)}`,
                        user_id: topUserVC.userId,
                    }
                }
            );

            const topUsersVCWithTags: {
                user_name: string | null,
                user_tag: string | null,
                count: number,
                avg_duration: string,
                total_duration: string,
                user_id: string,
            }[] = await Promise.all(topUsersVCWithTagsPromises);

            try {
                let msgsCsv: string | null = null;
                try {
                    const msgsFields = ['user_name', 'user_tag', 'count', 'avg_length', 'user_id'];
                    const msgsOpts = { msgsFields };
                    msgsCsv = parse(topUsersMsgsWithTags, msgsOpts);
                } catch (err) {}


                let vcCsv: string | null = null;
                try {
                    const vcFields = ['user_name', 'user_tag', 'count', 'avg_duration', 'total_duration', 'user_id'];
                    const vcOpts = { vcFields };
                    vcCsv = parse(topUsersVCWithTags, vcOpts);
                } catch (err) {}

                const random: number = Math.random();
                writeFileSync(`/tmp/msgs-${random}.csv`, msgsCsv);
                writeFileSync(`/tmp/vc-${random}.csv`, vcCsv);

                // post message
                await command.reply(
                    '', {
                        files: [
                            {
                                attachment: `/tmp/msgs-${random}.csv`,
                                name: 'messages.csv',
                            },
                            {
                                attachment: `/tmp/vc-${random}.csv`,
                                name: 'voice_chat.csv',
                            }
                        ]
                    }
                );

                unlinkSync(`/tmp/msgs-${random}.csv`);
                unlinkSync(`/tmp/vc-${random}.csv`);
            } catch (err) {
                Utils.logger.error(err);
            }
        } else if (command.content.toLowerCase().startsWith('--messages'.toLowerCase())) {
            const userId: string = command.content.slice(10).trim();
            const msgSamples: {
                channelId: string;
                msgId: string;
            }[] = await Db.sampleUserMessages(
                userId,
                command.guild.id,
            );

            const stringToPostPromises: Promise<string>[] = msgSamples.map(
                async (sample: {
                    channelId: string;
                    msgId: string;
                }, idx: number): Promise<string> => {
                    const channel: discord.TextChannel | undefined = command.guild.channels.get(sample.channelId) as discord.TextChannel | undefined;
                    if (channel === undefined) {
                        return `${idx + 1} (Channel Deleted)`;
                    }
                    const msg: discord.Message | undefined = await channel.fetchMessage(sample.msgId).catch(
                        (): undefined => undefined,
                    );
                    if (msg === undefined) {
                        return `${idx + 1} (Message Deleted)`;
                    }
                    const len: number = String(idx + 1).length + 1;
                    const indent: string = new Array(len + 1).join(' ');
                    const newContent: string = msg.content.replace(/\r\n|\r|\n/g, `\n${indent}`);
                    return `${idx + 1} ${newContent}`;
                },
            );
            const stringToPost: string = (await Promise.all(stringToPostPromises)).join('\n');
            postReplyByChunks(command, stringToPost);
            // } else if (command.content.toLowerCase().startsWith('--afkchannel')) {
            //     const channelId: string = command.content.slice(12).trim();
            //     Db.upsertSettings(command.guild.id, channelId);
            // }
        }
    },
);

message$.subscribe(
    (msg: discord.Message): void => {
        Db.insertNewMsg(
            new Date(),
            msg.author.id,
            msg.guild.id,
            msg.channel.id,
            msg.id,
            msg.content.length,
        );
    },
);

vcChanged$.pipe(
    groupBy(
        (oldNewMember: [discord.GuildMember, discord.GuildMember]): string => oldNewMember[0].id,
    ),
    mergeMap(
        (group$: GroupedObservable<string, [discord.GuildMember, discord.GuildMember]>):
            Observable<[
                [Date, string, string],
                [Date, string, string],
            ]> => group$.pipe(
                // this observable has events grouped by member id
                // we want to record when the first element is undefined and then the last element

                // we don't care if the user goes from one channel to the other
                filter(
                    (oldNewMember: [discord.GuildMember, discord.GuildMember]):
                        boolean => oldNewMember[0].voiceChannel === undefined
                        || oldNewMember[1].voiceChannel === undefined,
                ),
                // make sure our starting state is valid
                // only count from now when someone has joined
                skipWhile(
                    (oldNewMember: [discord.GuildMember, discord.GuildMember]):
                        boolean => oldNewMember[0].voiceChannel !== undefined,
                ),
                // create db object
                map(
                    (oldNewMember: [discord.GuildMember, discord.GuildMember]):
                        [Date, string, string] => ([
                            new Date(),
                            oldNewMember[0].user.id,
                            oldNewMember[1].guild.id,
                        ]),
                ),
                // pair up
                pairwise(),
                // filter out fast joins and leaves
                filter(
                    (values: [
                        [Date, string, string],
                        [Date, string, string],
                    ]): boolean => values[1][0].getTime()
                    - values[0][0].getTime()
                        > 2 * 60 * 1000,
                ),
            ),
    ),
).subscribe(
    (values: [
        [Date, string, string],
        [Date, string, string],
    ]): void => {
        Utils.logger.info(values);
        Db.insertNewVc(
            values[0][0],
            values[1][0],
            values[0][1],
            values[0][2],
        );
    },
);

const init = async (): Promise<void> => {
    await Db.createTables();
    // let obj = await Db.fetchTopUsersByMessageCount(
    //     '604266690892660736',
    // );
    // Utils.logger.debug(obj);
    // obj = await Db.fetchTopUsersByMessageCount(
    //     '668306526322032650',
    // );
    // Utils.logger.debug(obj);
    // let msgs: string[] = await Db.sampleUserMessages(
    //     '340010669493714947',
    //     '668306526322032650',
    // );
    // Utils.logger.debug(msgs);
    // msgs = await Db.sampleUserMessages(
    //     '340010669493714947',
    //     '668306526322032650',
    // );
    // Utils.logger.debug(msgs);
    await gClient.login(discordKey);
};
init();
