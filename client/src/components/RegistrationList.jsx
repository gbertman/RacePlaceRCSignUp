import { Badge, Card, Group, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';

function RegistrationList({ registrations, classes = [], onEdit }) {
    const entries = Object.entries(registrations).map(([key, registration]) => ({
        key,
        ...registration,
    }));

    const classCounts = entries.reduce((counts, r) => {
        (r.classes || []).forEach(name => {
            counts[name] = (counts[name] || 0) + 1;
        });
        return counts;
    }, {});

    const classesByType = classes.reduce((groups, c) => {
        const type = c.type || 'Other';
        if (!groups[type]) groups[type] = [];
        groups[type].push(c);
        return groups;
    }, {});

    return (
        <Stack pb="md" gap="xl">
            {classes.length > 0 ? (
                <Stack gap="sm">
                    <Title order={2} size="h4">Class Counts</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                        {Object.entries(classesByType).map(([type, group]) => (
                            <Card key={type} withBorder>
                                <Text fw={700} mb="xs">{type}</Text>
                                <Stack gap={6}>
                                    {group.map(c => (
                                        <Group key={c.name} justify="space-between">
                                            <Text>{c.name}</Text>
                                            <Badge color="gray" variant="filled">{classCounts[c.name] || 0}</Badge>
                                        </Group>
                                    ))}
                                </Stack>
                            </Card>
                        ))}
                    </SimpleGrid>
                </Stack>
            ) : null}
            <Stack gap="sm">
                <Group gap="sm">
                    <Title order={2} size="h4">Registered Racers</Title>
                    <Badge color="blue" variant="light" aria-label={`${entries.length} registered racers`}>
                        {entries.length}
                    </Badge>
                </Group>
                <Text fs="italic" c="dimmed">
                    Click your name below to edit your entry. If you no longer plan to race, please let the
                    office know so your registration can be removed.
                </Text>
                {entries.length === 0 ? (
                    <Text c="dimmed">No racers registered yet.</Text>
                ) : (
                    <div className="registered-racers-grid">
                        {entries.map(r => (
                            <Card key={r.key} withBorder padding="md" radius="md" className="registered-racer">
                                <UnstyledButton
                                    onClick={() => onEdit(r.key)}
                                    className="registered-racer-name"
                                    fw={700}
                                    c="blue"
                                    aria-label={`Edit registration for ${r.name}`}
                                >
                                    {r.name}
                                </UnstyledButton>
                                <Text size="xs" c="dimmed" mt="sm" mb={6}>
                                    {(r.classes || []).length} {(r.classes || []).length === 1 ? 'class' : 'classes'}
                                </Text>
                                {(r.classes || []).length > 0 ? (
                                    <ul className="registered-racer-classes">
                                        {r.classes.map(name => <li key={name}>{name}</li>)}
                                    </ul>
                                ) : (
                                    <Text size="sm" c="dimmed">No classes selected.</Text>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </Stack>
        </Stack>
    );
}

export default RegistrationList;
