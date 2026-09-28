import { useEffect, useState } from 'react';
import { Alert, Anchor, Badge, Button, Card, Group, Loader, SegmentedControl, Stack, Table, Text, Title } from '@mantine/core';

function RaceLineupsPage() {
    const [track, setTrack] = useState('on-road');
    const [refresh, setRefresh] = useState(0);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setData(null);
        async function load() {
            try {
                const response = await fetch(`/api/race-lineups/${track}`, { signal: controller.signal, cache: 'no-store' });
                if (!response.ok) throw new Error('Unable to load lineups from LiveRC. Please try again.');
                const next = await response.json();
                if (controller.signal.aborted) return;
                setData(next);
            } catch (loadError) {
                if (!controller.signal.aborted) setError(loadError.message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        load();
        return () => controller.abort();
    }, [track, refresh]);

    const round = data?.rounds.at(-1);
    const sourceUrl = track === 'on-road' ? 'https://raceplacerc.liverc.com/results/' : 'https://raceplacercoffroad.liverc.com/results/';

    return (
        <Stack gap="lg" maw={760} mx="auto">
            <Title order={1} size="h2">Race Lineups</Title>
            <SegmentedControl fullWidth size="md" aria-label="Track" value={track} onChange={setTrack}
                data={[{ value: 'on-road', label: 'On Road' }, { value: 'off-road', label: 'Off Road' }]} />
            <Group justify="space-between">
                <Text size="sm" c="dimmed">Open or refresh this page for the latest posted lineups.</Text>
                <Button variant="filled" onClick={() => setRefresh(value => value + 1)} disabled={loading}>Refresh</Button>
            </Group>
            {loading && <Group role="status"><Loader size="sm" /><Text>Loading race lineups...</Text></Group>}
            {error && <Alert color="red" role="alert">{error}</Alert>}
            {data && <>
                <div>
                    <Title order={2} size="h4">{data.eventName}</Title>
                    <Text size="sm" c="dimmed">Latest event posted on LiveRC · Checked {new Date(data.fetchedAt).toLocaleString()}</Text>
                </div>
                {round ? <Title order={2} size="h4">{round.label}</Title>
                    : <Alert color="blue">Qualifier lineups haven’t been posted yet.</Alert>}
                {!data.rounds.some(item => item.type === 'mains') && <Text c="dimmed">Mains haven’t been posted yet.</Text>}
                {round?.error && <Alert color="yellow" role="alert">{round.error}</Alert>}
                {round?.races.map(race => <Card key={race.number} withBorder padding="lg" radius="md">
                    <Group gap="sm" mb="md" align="flex-start" wrap="nowrap">
                        <Badge size="lg" radius="sm" style={{ flexShrink: 0 }}>Race {race.number}</Badge>
                        <Title order={3} size="h5">{race.name}</Title>
                    </Group>
                    {race.participants.length ? <Table verticalSpacing="sm">
                        <Table.Thead><Table.Tr><Table.Th w={80}>Car #</Table.Th><Table.Th>Participant</Table.Th></Table.Tr></Table.Thead>
                        <Table.Tbody>{race.participants.map((participant, index) => <Table.Tr key={index}>
                            <Table.Td>{participant.carNumber}</Table.Td>
                            <Table.Td style={{ overflowWrap: 'anywhere' }}>{participant.name}</Table.Td>
                        </Table.Tr>)}</Table.Tbody>
                    </Table> : <Text c="dimmed">Participants haven’t been posted yet.</Text>}
                </Card>)}
            </>}
            <Anchor href={round?.sourceUrl || sourceUrl} target="_blank" rel="noopener noreferrer" size="sm">View on LiveRC</Anchor>
        </Stack>
    );
}

export default RaceLineupsPage;
